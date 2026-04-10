// core/microimpulse2.js

import { detectMSES } from "./patterns.js";

// -------------------------------------------------------------
// VALIDACIÓ DE TIMESTAMP
// -------------------------------------------------------------
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000000) return null; // <-- ÚNIC CANVI
  return raw; // ms
}

// -------------------------------------------------------------
// EMA
// -------------------------------------------------------------
function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// -------------------------------------------------------------
// MICROIMPULSE EXACTE COM TRADINGVIEW (CORREGIT)
// -------------------------------------------------------------
export function detectMicroimpulse(candles, symbol, timeframe) {
  if (!candles || candles.length < 30) return null;

  const n = candles.length;

  const last  = candles[n - 1]; // última tancada
  const prev1 = candles[n - 2];
  const prev2 = candles[n - 3];

  if (!last || !prev1 || !prev2) return null;

  // ✔️ EMA20 com al Pine
  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes.slice(-80), 20);
  if (!ema20) return null;

  // ✔️ Tendència EXACTA com al Pine
  const trendUp   = last.close > prev1.close && prev1.close >= prev2.close;
  const trendDown = last.close < prev1.close && prev1.close <= prev2.close;

  // ✔️ Retrace EXACTE com al Pine
  function isSmallRetrace(dirLong, o,h,l,c) {
    const body = Math.abs(c - o);
    const rng = h - l;
    const bodyPct = rng > 0 ? (body / rng) * 100 : 100;
    const colorOK = dirLong ? c < o : c > o;
    const distPct = Math.abs(((h + l) / 2 - ema20) / ema20) * 100;
    return bodyPct < 40 && colorOK && distPct < 0.5; // 0.5% = distPctMax
  }

  const dirLong = trendUp;
  const r1 = isSmallRetrace(dirLong, prev1.open, prev1.high, prev1.low, prev1.close);
  const r2 = isSmallRetrace(dirLong, prev2.open, prev2.high, prev2.low, prev2.close);
  const retrace = r1 || r2;
  if (!retrace) return null;

  const retraceHigh = Math.max(prev1.high, prev2.high);
  const retraceLow  = Math.min(prev1.low, prev2.low);

  let type = null;
  let entry = null;

  // ✔️ Breakout EXACTE com al Pine
  if (trendUp && last.high > retraceHigh && last.close > retraceHigh) {
    type = "MICRO_LONG";
    entry = last.close;
  }

  if (trendDown && last.low < retraceLow && last.close < retraceLow) {
    type = "MICRO_SHORT";
    entry = last.close;
  }

  if (!type) return null;

  return {
    symbol,
    timeframe,
    type,
    entry,
    timestamp: last.timestamp, // ✔️ la vela tancada actual
    reason: "microimpulse",
    sensitivity: 40,
    status: "confirmed",
  };
}
