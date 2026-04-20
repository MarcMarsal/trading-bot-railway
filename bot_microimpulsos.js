// bot_microimpulsos.js — VERSIÓ FINAL 1:1 TRADINGVIEW (SUPORTA TOTS ELS TIPUS)

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
// CÀLCUL ENTRYR / TP / SL (només per M, E, CLÚSTERS)
// -------------------------------------------------------------
function calcTargets(type, entry, thirdCandle) {
  const { open, close, high, low } = thirdCandle;
  const body = Math.abs(close - open);

  let entryr = null;
  let tp = null;
  let sl = null;

  if (type === "M") {
    entryr = entry - body * 0.15;
    sl = low;
    const risk = entryr - sl;
    tp = entryr + risk * 1.5;
  }

  else if (type === "E") {
    entryr = entry + body * 0.15;
    sl = high;
    const risk = sl - entryr;
    tp = entryr - risk * 1.5;
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

  let msesState = getMsesState(symbol, timeframe);

  // ⚠️ Ara detectMSES retorna { signals: [...] }
  const { signals, state: newMsesState } =
    await detectMSES(candles, symbol, timeframe, msesState);

  setMsesState(symbol, timeframe, newMsesState);

  if (!signals || signals.length === 0) return;

  // Processar TOTES les senyals
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

      // Només M, E i CLÚSTERS tenen TP/SL
      const { entryr, tp, sl } = calcTargets(
        sig.type,
        sig.entry,
        sig.thirdCandle
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
  console.log("Bot MS/ES/CLÚSTER FIAT en marxa (versió 1:1 TradingView)");

  cron.schedule("* * * * *", mainLoop);
}

startBot();
