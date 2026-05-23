// bot_microimpulsos.js — FIAT‑PRO (patrons + ATR + tracking)

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
const ACTIVE_CRYPTOS = [
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
// ATR14 SIMPLE (FIAT‑PRO: ATR * 1 per TP i SL)
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

    trs.push(Math.max(highLow, highClose, lowClose));
  }

  if (trs.length < period) return null;

  const last = trs.slice(-period);
  return last.reduce((a, b) => a + b, 0) / period;
}

// -------------------------------------------------------------
// TP/SL FIAT‑PRO (ATR * 1)
// -------------------------------------------------------------
function tpSlAtr1(isLong, entry, atr) {
  const tp = isLong ? entry + atr : entry - atr;
  const sl = isLong ? entry - atr : entry + atr;
  return { tp, sl };
}

// -------------------------------------------------------------
// ENTRYR / TP / SL FIAT‑PRO
// -------------------------------------------------------------
function calcTargets(type, thirdCandle, atr) {
  const { open, close } = thirdCandle;
  const body = Math.abs(close - open);

  const entry = close;

  const entryr =
    type === "M"
      ? entry - body * 0.15
      : entry + body * 0.15;

  const { tp, sl } = tpSlAtr1(type === "M", entry, atr);

  return { entry, entryr, tp, sl };
}

// -------------------------------------------------------------
// PROCESSAR UN SÍMBOL (FIAT‑PRO)
// -------------------------------------------------------------
export async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 80);
  if (!candles || candles.length < 40) return;

  candles.sort((a, b) => a.timestamp - b.timestamp);

  const atr = calcATR(candles, 14);
  if (atr == null) return;

  const { signals } = await detectMSES(candles, symbol, timeframe);
  if (!signals || signals.length === 0) return;

  for (const sig of signals) {
    if (sig.type !== "M" && sig.type !== "E") continue;

    const exists = await alreadySent2(symbol, timeframe, sig.timestamp);
    if (exists) continue;

    console.log("[FIAT‑PRO]", symbol, timeframe, sig.type, sig.timestamp);

    const { entry, entryr, tp, sl } = calcTargets(
      sig.type,
      sig.thirdCandle,
      atr
    );

    await saveSignal2({
      symbol,
      timeframe,
      type: sig.type,     // només M o E
      entry,
      entryr,
      tp,
      sl,
      timestamp: sig.timestamp
    });
  }
}

// -------------------------------------------------------------
// TRACKING TP/SL (FIAT‑PRO)
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

    const isLong = s.type === "M";
    const isShort = s.type === "E";

    if (isLong) {
      if (high >= s.tp) hitTP = true;
      if (low <= s.sl) hitSL = true;
    }

    if (isShort) {
      if (low <= s.tp) hitTP = true;
      if (high >= s.sl) hitSL = true;
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
  for (const symbol of ACTIVE_CRYPTOS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  for (const symbol of ACTIVE_CRYPTOS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        await processSymbol(symbol, timeframe);
      } catch (err) {
        console.log("Error processant", symbol, timeframe, err.message);
      }
    }
  }

  await checkOpenSignals();
}

// -------------------------------------------------------------
// START BOT
// -------------------------------------------------------------
async function startBot() {
  await initDB();
  console.log("Bot FIAT‑PRO en marxa (patrons + ATR + tracking)");

  cron.schedule("* * * * *", mainLoop);
}

startBot();

