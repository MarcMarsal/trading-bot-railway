// bot_microimpulsos.js

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";
import { detectMSES } from "./core/patterns.js";
import { getDay } from "./core/utils.js";
import { fetchAndStoreCandles } from "./core/fetchcandles.js";

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["1H","4H"];

// -------------------------------------------------------------
// ESTAT GLOBAL PER MICROIMPULSOS I MSES
// -------------------------------------------------------------
const microStates = {}; // { "BCH-USDT-1H": { prevMicroLong, prevMicroShort } }
const msesStates  = {}; // { "BCH-USDT-1H": { prevMsCond, prevEsCond } }

function key(symbol, timeframe) {
  return `${symbol}-${timeframe}`;
}

function getMicroState(symbol, timeframe) {
  return microStates[key(symbol, timeframe)] || {};
}

function setMicroState(symbol, timeframe, state) {
  microStates[key(symbol, timeframe)] = state || {};
}

function getMsesState(symbol, timeframe) {
  return msesStates[key(symbol, timeframe)] || {};
}

function setMsesState(symbol, timeframe, state) {
  msesStates[key(symbol, timeframe)] = state || {};
}

// -------------------------------------------------------------
// GET CANDLES FROM DB
// -------------------------------------------------------------
async function getCandlesFromDB(symbol, timeframe, limit) {
  const query = `
    SELECT symbol, timeframe, open, high, low, close, volume, timestamp
    FROM candles
    WHERE symbol = $1 AND timeframe = $2
    ORDER BY timestamp DESC
    LIMIT $3
  `;

  const res = await client.query(query, [symbol, timeframe, limit]);
  return res.rows.reverse(); // més antigues → més noves
}

// -------------------------------------------------------------
// PROCESS SYMBOL (temps real)
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 80);
  if (!candles || candles.length < 30) return;

  candles.sort((a, b) => a.timestamp - b.timestamp);

  // -------------------------
  // MICROIMPULSE
  // -------------------------
  let microState = getMicroState(symbol, timeframe);

  const { signal: microSignal, state: newMicroState } =
    detectMicroimpulse(candles, symbol, timeframe, microState);

  setMicroState(symbol, timeframe, newMicroState);

  if (microSignal) {
    const dateKey = getDay(microSignal.timestamp);

    const exists = await alreadySent2(
      symbol,
      timeframe,
      microSignal.type,
      microSignal.entry,
      dateKey,
      "confirmed"
    );

    if (!exists) {
      console.log("[MICRO]", symbol, timeframe, microSignal.type, microSignal.timestamp);

      await saveSignal2({
        symbol,
        timeframe,
        type: microSignal.type,
        entry: microSignal.entry,
        timestamp: microSignal.timestamp,
        reason: microSignal.reason,
        sensitivity: microSignal.sensitivity,
        status: "confirmed",
      });
    }
  }

  // -------------------------
  // MS / ES
  // -------------------------
  let msesState = getMsesState(symbol, timeframe);

  const { signal: msesSignal, state: newMsesState } =
    detectMSES(candles, symbol, timeframe, msesState);

  setMsesState(symbol, timeframe, newMsesState);

  if (msesSignal) {
    const dateKey = getDay(msesSignal.timestamp);

    const exists = await alreadySent2(
      symbol,
      timeframe,
      msesSignal.type,
      msesSignal.entry,
      dateKey,
      "mses"
    );

    if (!exists) {
      console.log("[MSES]", symbol, timeframe, msesSignal.type, msesSignal.timestamp);

      await saveSignal2({
        symbol,
        timeframe,
        type: msesSignal.type,
        entry: msesSignal.entry,
        timestamp: msesSignal.timestamp,
        reason: msesSignal.reason,
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
  // 1) Actualitzar candles
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  // 2) Processar senyals
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

