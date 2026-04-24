// bot_microimpulsos.js — VERSIÓ SL/TP MS/ES ANCORAT A C1 + ATR + FILTRE BTC

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMSES, computeBTCContext } from "./core/patterns.js";
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

  // -------------------------------------------------------------
  // OPCIÓ C — SL ancorat a C1 + TP basat en ATR
  // -------------------------------------------------------------
  if (type === "M") {
    entryr = entry - body * 0.15;

    if (atr && atr > 0) {
      sl = low - atr * 1.1;
      tp = entry + atr * 1.5;
    } else {
      sl = low;
      tp = entry + (entry - sl) * 1.5;
    }
  }

  else if (type === "E") {
    entryr = entry + body * 0.15;

    if (atr && atr > 0) {
      sl = high + atr * 1.1;
      tp = entry - atr * 1.5;
    } else {
      sl = high;
      tp = entry - (sl - entry) * 1.5;
    }
  }

  else if (type === "DISCARD_MS") {
    // Calcular com un M normal
    entryr = entry - body * 0.15;

    if (atr && atr > 0) {
      sl = low - atr * 1.1;
      tp = entry + atr * 1.5;
    } else {
      sl = low;
      tp = entry + (entry - sl) * 1.5;
    }
  }

  else if (type === "DISCARD_ES") {
    // Calcular com un E normal
    entryr = entry + body * 0.15;

    if (atr && atr > 0) {
      sl = high + atr * 1.1;
      tp = entry - atr * 1.5;
    } else {
      sl = high;
      tp = entry - (sl - entry) * 1.5;
    }
  }


  // -------------------------------------------------------------
  // CLÚSTERS (no es toquen)
  // -------------------------------------------------------------
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
// PROCESSAR UN SÍMBOL (ARA REP btcContext)
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe, btcContext) {
  const candles = await getCandlesFromDB(symbol, timeframe, 80);
  if (!candles || candles.length < 30) return;

  candles.sort((a, b) => a.timestamp - b.timestamp);

  const atr = calcATR(candles, 14);

  let msesState = getMsesState(symbol, timeframe);

  const { signals, state: newMsesState } =
    await detectMSES(candles, symbol, timeframe, msesState, btcContext);

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
// LOOP PRINCIPAL (ARA CALCULA BTC CONTEXT 1 SOLA VEGADA)
// -------------------------------------------------------------
async function mainLoop() {
  // 1) Actualitzar veles
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  // 2) Calcular context BTC
  let btcContext = null;
  for (const timeframe of TIMEFRAMES) {
    const btcCandles = await getCandlesFromDB("BTC-USDT", timeframe, 80);
    btcCandles.sort((a, b) => a.timestamp - b.timestamp);
    btcContext = computeBTCContext(btcCandles);
  }

  // 3) Processar totes les criptos amb el context BTC
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        await processSymbol(symbol, timeframe, btcContext);
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
  console.log("Bot MS/ES/CLÚSTER FIAT en marxa (SL/TP MS/ES ancorat a C1 + ATR + FILTRE BTC)");

  cron.schedule("* * * * *", mainLoop);
}

startBot();
