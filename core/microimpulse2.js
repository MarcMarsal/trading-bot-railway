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
// MICROIMPULSE EXACTE COM TRADINGVIEW
// -------------------------------------------------------------
export function detectMicroimpulse(candles, symbol, timeframe) {
  if (!candles || candles.length < 30) return null;

  const n = candles.length;
  const last = candles[n - 2];   // última vela TANCADA
  const prev1 = candles[n - 3];
  const prev2 = candles[n - 4];
  if (!last || !prev1 || !prev2) return null;

  // ============================
  // EMA20 / EMA40 com TradingView
  // ============================
  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes.slice(-80), 20);
  const ema40 = calcEMA(closes.slice(-80), 40);
  if (!ema20 || !ema40) return null;

  const trendUp   = ema20 > ema40;
  const trendDown = ema20 < ema40;

  const trendPercent = trendUp || trendDown ? 60 : 0;

  // ============================
  // MS / ES (FIAT TradingView)
  // ============================
  const mses = detectMSES(candles);
  const hasMS = mses?.type === "MS_LONG";
  const hasES = mses?.type === "MS_SHORT";

  const msPercent = hasMS || hasES ? 70 : 0;

  // ============================
  // Volum OK (igual que Pine)
  // ============================
  const volumes = candles.map(c => c.volume);
  const smaVol20 = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const volumeOK = last.volume > smaVol20;

  // ============================
  // TRENDALIVE (condició obligatòria)
  // ============================
  const trendAlive = trendPercent >= 50 && msPercent < 50 && volumeOK;
  if (!trendAlive) return null;

  // ============================
  // Retracement realista (FIAT)
  // ============================
  function isSmallRetrace(dirLong, o,h,l,c) {
    const body = Math.abs(c - o);
    const rng = h - l;
    const bodyPct = rng > 0 ? (body / rng) * 100 : 100;
    const colorOK = dirLong ? c < o : c > o;
    const distPct = Math.abs(((h + l) / 2 - ema20) / ema20) * 100;
    return bodyPct < 40 && colorOK && distPct < 0.5;
  }

  const dirLong = trendUp;
  const r1 = isSmallRetrace(dirLong, prev1.open, prev1.high, prev1.low, prev1.close);
  const r2 = isSmallRetrace(dirLong, prev2.open, prev2.high, prev2.low, prev2.close);
  const retrace = r1 || r2;
  if (!retrace) return null;

  const retraceHigh = Math.max(prev1.high, prev2.high);
  const retraceLow  = Math.min(prev1.low, prev2.low);

  // ============================
  // Breakout final (FIAT)
  // ============================
  let type = null;
  let entry = null;

  if (trendUp && last.high > retraceHigh && last.close > retraceHigh) {
    type = "MICRO_LONG";
    entry = last.close;
  }

  if (trendDown && last.low < retraceLow && last.close < retraceLow) {
    type = "MICRO_SHORT";
    entry = last.close;
  }

  if (!type) return null;

  // ============================
  // Timestamp FIAT
  // ============================
  const rawTs =
    normalizeTimestamp(last.timestamp) ??
    normalizeTimestamp(last.time) ??
    normalizeTimestamp(last.openTime) ??
    normalizeTimestamp(last.closeTime) ??
    normalizeTimestamp(last.t) ??
    normalizeTimestamp(last.ts) ??
    Date.now();

  return {
    symbol,
    timeframe,
    type,
    entry,
    timestamp: rawTs,
    reason: "microimpulse",
    sensitivity: 40
  };
}


export function detectMicroimpulseEarly(candles, symbol, timeframe) {
  if (!candles || candles.length < 30) return null;

  const n = candles.length;
  const last  = candles[n - 1]; // aquí sí: vela oberta / en construcció
  const prev1 = candles[n - 2];
  const prev2 = candles[n - 3];
  if (!last || !prev1 || !prev2) return null;

  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes.slice(-80), 20);
  const ema40 = calcEMA(closes.slice(-80), 40);
  if (!ema20 || !ema40) return null;

  const trendUp   = ema20 > ema40;
  const trendDown = ema20 < ema40;
  const trendPercent = trendUp || trendDown ? 60 : 0;

  const mses = detectMSES(candles, symbol, timeframe);
  const hasMS = mses?.type === "MS_LONG";
  const hasES = mses?.type === "MS_SHORT";
  const msPercent = hasMS || hasES ? 70 : 0;

  const volumes = candles.map(c => c.volume);
  const smaVol20 = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const volumeOK = last.volume > smaVol20;

  const trendAlive = trendPercent >= 50 && msPercent < 50 && volumeOK;
  if (!trendAlive) return null;

  function isSmallRetrace(dirLong, o,h,l,c) {
    const body = Math.abs(c - o);
    const rng = h - l;
    const bodyPct = rng > 0 ? (body / rng) * 100 : 100;
    const colorOK = dirLong ? c < o : c > o;
    const distPct = Math.abs(((h + l) / 2 - ema20) / ema20) * 100;
    return bodyPct < 40 && colorOK && distPct < 0.5;
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

  if (trendUp && last.high > retraceHigh && last.close > retraceHigh) {
    type = "MICRO_LONG";
    entry = last.close;
  }

  if (trendDown && last.low < retraceLow && last.close < retraceLow) {
    type = "MICRO_SHORT";
    entry = last.close;
  }

  if (!type) return null;

  const rawTs =
    normalizeTimestamp(last.timestamp) ??
    normalizeTimestamp(last.time) ??
    normalizeTimestamp(last.openTime) ??
    normalizeTimestamp(last.closeTime) ??
    normalizeTimestamp(last.t) ??
    normalizeTimestamp(last.ts) ??
    Date.now();

  return {
    symbol,
    timeframe,
    type,
    entry,
    timestamp: rawTs,
    reason: "microimpulse",
    sensitivity: 40,
    status: "early",
  };
}

