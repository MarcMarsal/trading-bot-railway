// bot_microimpulsos.js — FIAT v1 PUR (1:1 TradingView)

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMSES } from "./core/patterns.js";
import { fetchAndStoreCandles } from "./core/fetchcandles.js";

// -------------------------------------------------------------
// CONFIG
// -------------------------------------------------------------
const SYMBOLS = [
  "BTC-USDT","SUI-USDT","SOL-USDT","XRP-USDT","AVAX-USDT",
  "APT-USDT","INJ-USDT","SEI-USDT","ADA-USDT","LINK-USDT",
  "BNB-USDT","ETH-USDT","NEAR-USDT","HBAR-USDT","RENDER-USDT",
  "ASTER-USDT","BCH-USDT","VIRTUAL-USDT","ATOM-USDT",
  "OP-USDT","ARB-USDT","DOT-USDT"
];

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
// ATR14 SIMPLE (per TP/SL)
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
// CÀLCUL ENTRYR / TP / SL (1:1 TradingView)
// -------------------------------------------------------------
function calcTargets(type, entry, thirdCandle, atr) {
  const { open, close, high, low } = thirdCandle;
  const body = Math.abs(close - open);

  let entryr = null;
  let tp = null;
  let sl = null;

  if (type === "M") {
    entryr = entry - body * 0.15;
    sl = low - atr * 1.1;
    tp = entry + atr * 1.5;
  }

  if (type === "E") {
    entryr = entry + body * 0.15;
    sl = high + atr * 1.1;
    tp = entry - atr * 1.5;
  }

  return { entryr, tp, sl };
}

// -------------------------------------------------------------
// PROCESSAR UN SÍMBOL (FIAT v1)
// -------------------------------------------------------------
// processSymbol.js (FIAT v1 final)
export async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 80);
  if (!candles || candles.length < 40) return;

  // Ordenar veles de més antiga a més nova
  candles.sort((a, b) => a.timestamp - b.timestamp);

  // ATR per targets
  const atr = calcATR(candles, 14);

  // FIAT v1: MS/ES + scoring
  const { signals } = await detectMSES(candles, symbol, timeframe);
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
      finalType,
      sig.timestamp   // <-- JA és ms
    );

    if (exists) {
      // Ja existeix → no enviar ni guardar
      continue;
    }

    // Log FIAT v1
    console.log("[FIAT]", symbol, timeframe, finalType, sig.timestamp);

    // Calcular targets FIAT v1
    const { entryr, tp, sl } = calcTargets(
      sig.type,        // RAW per targets
      sig.entry,
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
      //timestamp: Math.floor(sig.timestamp / 1000), // segons
      timestamp: sig.timestamp,
      timestamp_ms: sig.timestamp,                 // mil·lisegons
      score: sig.score,
      isGood: sig.isGood,
      reason: ""
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
  // 1) Actualitzar veles
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  // 2) Processar totes les criptos
  for (const symbol of SYMBOLS) {
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
  console.log("Bot FIAT v1 en marxa (MS/ES + FIAT scoring + GOOD/DISCARD)");

  cron.schedule("* * * * *", mainLoop);
}

startBot();
