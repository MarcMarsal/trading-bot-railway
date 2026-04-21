// bot_microimpulsos.js — VERSIÓ SL/TP MS/ES ANCORAT A C1 + ATR

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMSES } from "./core/patterns.js";
import { getDay } from "./core/utils.js";
import { fetchAndStoreCandles } from "./core/fetchcandles.js";

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT","ATOM-USDT",
  "OP-USDT","ARB-USDT","DOT-USDT"
];

const TIMEFRAMES = ["1H"];

// -------------------------------------------------------------
// ESTAT GLOBAL PER MSES (clusters i transicions)
// -------------------------------------------------------------
const msesStates = {};

function key(symbol, timeframe) {
  return `${symbol}-${timeframe}`;
}

function getMsesState(symbol, timeframe) {
  return msesStates[key(symbol, timeframe)] || {};
}

function setMsesState(symbol, timeframe, state) {
  msesStates[key(symbol, timeframe)] = state || {};
}

// -------------------------------------------------------------
// LLEGIR VELAS DE LA DB
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
  return res.rows.reverse();
}

// -------------------------------------------------------------
// ATR14 SIMPLE
// -------------------------------------------------------------
function calcATR(candles, period = 14) {
  if (!candles || candles.length <= period) return null;

  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];

    const highLow = cur.high - cur.low;
    const highClose = Math.abs(cur.high - prev.close);
    const lowClose = Math.abs(cur.low - prev.close);

    const tr = Math.max(highLow, highClose, lowClose);
    trs.push(tr);
  }

  if (trs.length < period) return null;

  const last = trs.slice(-period);
  const sum = last.reduce((a, b) => a + b, 0);
  return sum / period;
}

// -------------------------------------------------------------
// CÀLCUL ENTRYR / TP / SL (només per M, E, CLÚSTERS)
// -------------------------------------------------------------
function calcTargets(type, entry, thirdCandle, atr) {
  const { open, close, high, low } = thirdCandle;
  const body = Math.abs(close - open);

  let entryr = null;
  let tp = null;
  let sl = null;

  // Configurables
  const atrFactor = 1.1; // respiració (pots pujar a 1.2–1.3)
  const tpR = 1.3;       // TP = 1.3R

  if (type === "M") {
    // Entrada de retrocés com abans
    entryr = entry - body * 0.15;

    if (atr && atr > 0) {
      const baseSL = low;
      const buffer = atr * atrFactor;
      sl = baseSL - buffer;

      const risk = entryr - sl;
      tp = entryr + risk * tpR;
    } else {
      // Fallback: lògica antiga si no hi ha ATR
      sl = low;
      const risk = entryr - sl;
      tp = entryr + risk * 1.5;
    }
  }

  else if (type === "E") {
    // Entrada de retrocés com abans
    entryr = entry + body * 0.15;

    if (atr && atr > 0) {
      const baseSL = high;
      const buffer = atr * atrFactor;
      sl = baseSL + buffer;

      const risk = sl - entryr;
      tp = entryr - risk * tpR;
    } else {
      // Fallback: lògica antiga si no hi ha ATR
      sl = high;
      const risk = sl - entryr;
      tp = entryr - risk * 1.5;
    }
  }

  else if (type === "CLUSTER_UP") {
    entryr = entry;
    sl = null;
    tp = entry + entry * 0.025;
  }

  else if (type === "CLUSTER_DOWN") {
    entryr = entry;
    sl = null;
    tp = entry - entry * 0.025;
  }

  return { entryr, tp, sl };
}

// -------------------------------------------------------------
// PROCESSAR UN SÍMBOL
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 80);
  if (!candles || candles.length < 30) return;

  candles.sort((a, b) => a.timestamp - b.timestamp);

  // ATR per aquest símbol/TF
  const atr = calcATR(candles, 14);

  let msesState = getMsesState(symbol, timeframe);

  const { signals, state: newMsesState } =
    await detectMSES(candles, symbol, timeframe, msesState);

  setMsesState(symbol, timeframe, newMsesState);

  if (!signals || signals.length === 0) return;

  for (const sig of signals) {
    const dateKey = getDay(sig.timestamp);

    const exists = await alreadySent2(
      symbol,
      timeframe,
      sig.type,
      sig.entry,
      dateKey,
      "mses"
    );

    if (!exists) {
      console.log("[MSES]", symbol, timeframe, sig.type, sig.timestamp);

      const { entryr, tp, sl } = calcTargets(
        sig.type,
        sig.entry,
        sig.thirdCandle,
        atr
      );

      await saveSignal2({
        symbol,
        timeframe,
        type: sig.type,
        entry: sig.entry,
        entryr,
        tp,
        sl,
        timestamp: sig.timestamp,
        reason: sig.reason,
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
  console.log("Bot MS/ES/CLÚSTER FIAT en marxa (SL/TP MS/ES ancorat a C1 + ATR)");

  cron.schedule("* * * * *", mainLoop);
}

startBot();
