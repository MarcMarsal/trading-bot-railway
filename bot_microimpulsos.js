// bot_microimpulsos.js — FIAT v1 1:1 TradingView

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMSES } from "./core/patterns.js";
import { fetchAndStoreCandles } from "./core/fetchcandles.js";
import { splitSpainDate } from "./core/utils.js";

// -------------------------------------------------------------
// CONFIG
// -------------------------------------------------------------
const AVAILABLE_CRYPTOS = [
  "BTC-USDT","SUI-USDT","SOL-USDT","XRP-USDT","AVAX-USDT",
  "APT-USDT","INJ-USDT","SEI-USDT","ADA-USDT","LINK-USDT",
  "BNB-USDT","ETH-USDT","NEAR-USDT","HBAR-USDT","RENDER-USDT",
  "ASTER-USDT","BCH-USDT","VIRTUAL-USDT","ATOM-USDT",
  "OP-USDT","ARB-USDT","DOT-USDT"
];

// Avui: totes activades per validar 1:1
const ACTIVE_CRYPTOS = [...AVAILABLE_CRYPTOS];

const TIMEFRAMES = ["1H"];

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
// ATR14 SIMPLE (per TP/SL) — mantenim la versió que ja funcionava
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
// TP/SL ROUTER FIAT (1:1 TradingView)
// -------------------------------------------------------------
function tpSlFixed(isLong, entry) {
  const tp = isLong ? entry * 1.02 : entry * 0.98;
  const sl = isLong ? entry * 0.99 : entry * 1.01;
  return { tp, sl };
}

function tpSlAtr(isLong, entry, body, atr, high, low) {
  const sl = isLong ? low - atr * 1.1 : high + atr * 1.1;
  const tp = isLong ? entry + atr * 1.5 : entry - atr * 1.5;
  return { tp, sl };
}

function tpSlRouter(symbol, type, entry, body, atr, high, low) {
  const isLong = type === "M";

  // IMPORTANT: mantenim el símbol amb guionet
  if (symbol === "SOL-USDT") {
    return tpSlAtr(isLong, entry, body, atr, high, low);
  } else if (symbol === "BTC-USDT") {
    return tpSlFixed(isLong, entry);
  } else {
    return tpSlAtr(isLong, entry, body, atr, high, low);
  }
}

// -------------------------------------------------------------
// CÀLCUL ENTRYR / TP / SL (1:1 TradingView)
// -------------------------------------------------------------
function calcTargets(symbol, type, thirdCandle, atr) {
  const { open, close, high, low } = thirdCandle;
  const body = Math.abs(close - open);

  const entry = close; // c1.close, igual que sig.entry

  const entryr =
    type === "M"
      ? entry - body * 0.15
      : entry + body * 0.15;

  const { tp, sl } = tpSlRouter(
    symbol,
    type,
    entry,
    body,
    atr,
    high,
    low
  );

  return { entryr, tp, sl };
}

// -------------------------------------------------------------
// PROCESSAR UN SÍMBOL (FIAT v1)
// -------------------------------------------------------------
export async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 80);
  if (!candles || candles.length < 40) return;

  // Ordenar veles de més antiga a més nova
  candles.sort((a, b) => a.timestamp - b.timestamp);

  // ATR per targets
  const atr = calcATR(candles, 14);
  if (atr == null) return;

  // FIAT v1: MS/ES + scoring (1:1 TradingView)
  const { signals,trendDebug } = await detectMSES(candles, symbol, timeframe);
  if (trendDebug) {
  panel.trendDebug = trendDebug;
}
  if (!signals || signals.length === 0) return;

  for (const sig of signals) {
    // Tipus RAW FIAT v1: "M" o "E"
    if (sig.type !== "M" && sig.type !== "E") {
      console.log("[FIAT] Tipus inesperat:", sig.type);
      continue;
    }

    // Convertir a tipus FINAL (GOOD/DISCARD)
    const finalType =
      sig.type === "M"
        ? (sig.isGood ? "M_GOOD" : "M_DISCARD")
        : (sig.isGood ? "E_GOOD" : "E_DISCARD");

    // Comprovació de duplicats amb tipus FINAL i timestamp_ms
    const exists = await alreadySent2(
      symbol,
      timeframe,
      sig.timestamp   // ms
    );

    if (exists) {
      continue;
    }

    // Log FIAT v1
    console.log("[FIAT]", symbol, timeframe, finalType, sig.timestamp);

    // Calcular targets FIAT v1 (1:1 TradingView)
    const { entryr, tp, sl } = calcTargets(
      symbol,
      sig.type,
      sig.thirdCandle,
      atr
    );

    // Guardar senyal FIAT v1
    await saveSignal2({
       symbol,
       timeframe,
       type: finalType,
       entry: sig.entry,
       entryr,
       tp,
       sl,
       timestamp: sig.timestamp,
       timestamp_ms: sig.timestamp,
       score: sig.score,
       isGood: sig.isGood,
       reason: "",

       // 🔥 FIAT: afegim els punts
       mag_pts: sig.mag_pts,
       macd_pts: sig.macd_pts,
       trend_pts: sig.trend_pts,
       sat_pts: sig.sat_pts
     });

  }
}

// -------------------------------------------------------------
// TRACKING TP/SL
// -------------------------------------------------------------
async function checkOpenSignals() {
  const res = await client.query(`
    SELECT *
    FROM signals2
    WHERE closed = false
  `);

  for (const s of res.rows) {
    if (s.tp == null && s.sl == null) continue;

    const candles = await getCandlesFromDB(s.symbol, s.timeframe, 1);
    if (!candles || candles.length === 0) continue;

    const curr = candles[candles.length - 1];
    const high = curr.high;
    const low = curr.low;

    let hitTP = false;
    let hitSL = false;

    const isLong = s.type.startsWith("M");
    const isShort = s.type.startsWith("E");

    if (isLong) {
      if (s.tp != null && high >= s.tp) hitTP = true;
      if (s.sl != null && low <= s.sl) hitSL = true;
    }

    if (isShort) {
      if (s.tp != null && low <= s.tp) hitTP = true;
      if (s.sl != null && high >= s.sl) hitSL = true;
    }

    if (hitTP || hitSL) {
      const nowMs = Date.now();
      const { date_es, hora_es } = splitSpainDate(nowMs);

      await client.query(
        `
        UPDATE signals2
        SET closed = true,
            result = $1,
            timestamp_closed = $2,
            date_es_closed = $3,
            hora_es_closed = $4
        WHERE id = $5
      `,
        [hitTP ? "TP" : "SL", nowMs, date_es, hora_es, s.id]
      );

      console.log(`[TRACK] ${s.symbol} ${s.type} → ${hitTP ? "TP" : "SL"}`);
    }
  }
}

// -------------------------------------------------------------
// LOOP PRINCIPAL
// -------------------------------------------------------------
async function mainLoop() {
  // 1) Actualitzar veles (totes les criptos activades)
  for (const symbol of ACTIVE_CRYPTOS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  // 2) Processar totes les criptos activades
  for (const symbol of ACTIVE_CRYPTOS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        await processSymbol(symbol, timeframe);
      } catch (err) {
        console.log("Error processant", symbol, timeframe, err.message);
      }
    }
  }

  // 3) Tracking TP/SL
  await checkOpenSignals();
}

// -------------------------------------------------------------
// START BOT
// -------------------------------------------------------------
async function startBot() {
  await initDB();
  console.log("Bot FIAT v1 en marxa (MS/ES + FIAT scoring + GOOD/DISCARD, 1:1 TradingView)");

  // Cada minut, com abans
  cron.schedule("* * * * *", mainLoop);
}

startBot();
