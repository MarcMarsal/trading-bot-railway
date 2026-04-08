// bot_microimpulsos.js

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";
import { detectMSES } from "./core/patterns.js";
import { splitSpainDate } from "./core/utils.js";
import { getDay } from "./core/utils.js";

// IMPORTEM LA FUNCIÓ CORRECTA (sense duplicats)
import { fetchAndStoreCandles } from "./core/fetchcandles.js";

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["15m", "30m", "1H"];

// -------------------------------------------------------------
// GET CANDLES FROM DB (PG)
// -------------------------------------------------------------
async function getCandlesFromDB(symbol, timeframe, limit) {
  const query = `
    SELECT symbol, timeframe, open, high, low, close, volume, timestamp
    FROM candles
    WHERE symbol = $1 AND timeframe = $2
    ORDER BY timestamp DESC
    LIMIT $3
  `;

  const params = [symbol, timeframe, limit];
  const res = await client.query(query, params);

  return res.rows.reverse();
}

// -------------------------------------------------------------
// MICROIMPULSOS FIAT
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 62);
  if (!candles || candles.length < 60) return;

  // -------------------------------------------------------------
  // 1) CONFIRMED (només veles tancades)
  // -------------------------------------------------------------
  const closedCandles = candles.slice(0, -1);
  const micro = detectMicroimpulse(closedCandles, symbol, timeframe);

  if (micro) {
    const dateKey = getDay(micro.timestamp);

    const already = await alreadySent2(
      symbol,
      timeframe,
      micro.type,
      micro.entry,
      dateKey,
      "confirmed"
    );

    if (!already) {
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
  // 2) MSES
  // -------------------------------------------------------------
  const mses = detectMSES(candles, symbol, timeframe);

  if (mses) {
    const dateKey = getDay(mses.timestamp);

    const alreadyMSES = await alreadySent2(
      symbol,
      timeframe,
      mses.type,
      mses.entry,
      dateKey,
      "mses"
    );

    if (!alreadyMSES) {
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
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

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
