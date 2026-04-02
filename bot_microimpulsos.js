// bot_microimpulsos.js

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";
import { detectMicroimpulseEarly } from "./core/microimpulse2.js";
import { detectMSES } from "./core/patterns.js";

// IMPORTEM LA FUNCIÓ CORRECTA (sense duplicats)
import { fetchAndStoreCandles } from "./core/fetchcandles.js";

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["15m", "30m", "1H", "4H"];

// -------------------------------------------------------------
// GET CANDLES FROM DB (PG)
// -------------------------------------------------------------
async function getCandlesFromDB(symbol, timeframe, limit) {
  const query = `
    SELECT symbol, timeframe, open, high, low, close, volume, timestamp
    FROM candles
    WHERE symbol = $1 AND timeframe = $2
    ORDER BY timestamp ASC
    LIMIT $3
  `;

  const params = [symbol, timeframe, limit];
  const res = await client.query(query, params);
  return res.rows;
}

// -------------------------------------------------------------
// MICROIMPULSOS FIAT
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 62);
  if (!candles || candles.length < 60) return;

  // 1) ALERTA TEMPRANA (intravela)
  const early = detectMicroimpulseEarly(candles, symbol, timeframe);
  if (early) {
    const tsSecEarly = Math.floor(early.timestamp / 1000);
    const alreadyEarly = await alreadySent2(symbol, timeframe, early.type, tsSecEarly, "early");

    if (!alreadyEarly) {
      await saveSignal2({
        symbol,
        timeframe,
        type: early.type,
        entry: early.entry,       // 🔥 price FIAT
        timestamp: early.timestamp,
        reason: early.reason,
        sensitivity: early.sensitivity,
        status: "early",
      });

      console.log(`Microimpuls EARLY: ${symbol} ${timeframe} → ${early.type}`);
    }
  }

  // 2) CONFIRMAT (vela tancada)
  if (candles.length < 61) return;
  const closedCandles = candles.slice(0, -1);
  const micro = detectMicroimpulse(closedCandles, symbol, timeframe);

  if (micro) {
    const tsSec = Math.floor(micro.timestamp / 1000);
    const already = await alreadySent2(symbol, timeframe, micro.type, tsSec, "confirmed");

    if (!already) {
      await saveSignal2({
        symbol,
        timeframe,
        type: micro.type,
        entry: micro.entry,       // 🔥 price FIAT
        timestamp: micro.timestamp,
        reason: micro.reason,
        sensitivity: micro.sensitivity,
        status: "confirmed",
      });

      console.log(`Microimpuls CONFIRMED: ${symbol} ${timeframe} → ${micro.type}`);
    }
  }

  // 3) MS / ES (estructura de mercat)
  const mses = detectMSES(candles, symbol, timeframe);

  if (mses) {
    const tsSecMSES = Math.floor(mses.timestamp / 1000);
    const alreadyMSES = await alreadySent2(symbol, timeframe, mses.type, tsSecMSES, "mses");

    if (!alreadyMSES) {
      await saveSignal2({
        symbol,
        timeframe,
        type: mses.type,
        price: mses.entry,        // 🔥 price FIAT (mai null)
        timestamp: mses.timestamp,
        reason: mses.reason,
        sensitivity: 50,
        status: "mses",
      });

      console.log(`MSES DETECTED: ${symbol} ${timeframe} → ${mses.type}`);
    }
  }
}

// -------------------------------------------------------------
// LOOP PRINCIPAL
// -------------------------------------------------------------
async function mainLoop() {
  // 1) Descarregar i guardar veles
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  // 2) Processar microimpulsos
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        await processSymbol(symbol, timeframe);
      } catch (err) {
        console.log("Error processant", symbol, timeframe, err.message);
      }
    }
  }
}

// -------------------------------------------------------------
// START BOT
// -------------------------------------------------------------
async function startBot() {
  await initDB();
  console.log("Bot Microimpulsos FIAT en marxa");
  cron.schedule("* * * * *", mainLoop);
}

startBot();
