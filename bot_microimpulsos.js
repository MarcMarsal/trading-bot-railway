// bot_microimpulsos.js

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";
import { detectMicroimpulseEarly } from "./core/microimpulse2.js";
import { detectMSES } from "./core/patterns.js";
import { splitSpainDate } from "./core/utils.js";

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
    ORDER BY timestamp DESC     -- ✅ agafem les més recents
    LIMIT $3
  `;

  const params = [symbol, timeframe, limit];
  const res = await client.query(query, params);

  // les hem demanat DESC, les tornem a posar en ordre cronològic
  return res.rows.reverse();
}


// -------------------------------------------------------------
// MICROIMPULSOS FIAT
// -------------------------------------------------------------
import { splitSpainDate } from "../core/utils.js";

async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 62);
  if (!candles || candles.length < 60) return;

  // -------------------------------------------------------------
  // 1) ALERTA TEMPRANA (intravela)
  // -------------------------------------------------------------
  const early = detectMicroimpulseEarly(candles, symbol, timeframe);

  if (early) {
    const { date_es } = splitSpainDate(early.timestamp);

    const alreadyEarly = await alreadySent2(
      symbol,
      timeframe,
      early.type,
      early.entry,
      date_es,
      "early"
    );

    if (!alreadyEarly) {
      console.log(`Microimpuls EARLY: ${symbol} ${timeframe} → ${early.type}`);

      await saveSignal2({
        symbol,
        timeframe,
        type: early.type,
        entry: early.entry,
        timestamp: early.timestamp,
        reason: early.reason,
        sensitivity: early.sensitivity,
        status: "early",
      });
    }
  }

  // -------------------------------------------------------------
  // 2) CONFIRMAT (vela tancada)
  // -------------------------------------------------------------
  if (candles.length < 61) return;

  const closedCandles = candles.slice(0, -1);
  const micro = detectMicroimpulse(closedCandles, symbol, timeframe);

  if (micro) {
    const { date_es } = splitSpainDate(micro.timestamp);

    const already = await alreadySent2(
      symbol,
      timeframe,
      micro.type,
      micro.entry,
      date_es,
      "confirmed"
    );

    if (!already) {
      console.log(`Microimpuls CONFIRMED: ${symbol} ${timeframe} → ${micro.type}`);

      await saveSignal2({
        symbol,
        timeframe,
        type: micro.type,
        entry: micro.entry,
        timestamp: micro.timestamp,
        reason: micro.reason,
        sensitivity: micro.sensitivity,
        status: "confirmed",
      });
    }
  }

  // -------------------------------------------------------------
  // 3) MS / ES (estructura de mercat)
  // -------------------------------------------------------------
  const mses = detectMSES(candles, symbol, timeframe);

  if (mses) {
    const { date_es } = splitSpainDate(mses.timestamp);

    const alreadyMSES = await alreadySent2(
      symbol,
      timeframe,
      mses.type,
      mses.entry,
      date_es,
      "mses"
    );

    if (!alreadyMSES) {
      console.log(`MSES DETECTED: ${symbol} ${timeframe} → ${mses.type}`);
      await saveSignal2({
        symbol,
        timeframe,
        type: mses.type,
        entry: mses.entry,
        timestamp: mses.timestamp,
        reason: mses.reason,
        sensitivity: 50,
        status: "mses",
      });

      
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
