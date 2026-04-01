import { detectMSES } from "./patterns.js";

// -------------------------------------------------------------
// VALIDACIÓ DE TIMESTAMP
// -------------------------------------------------------------
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1000000000) return null;
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
// MICROIMPULSE FIAT (1:1 amb lògica simple)
// -------------------------------------------------------------
export function detectMicroimpulse(candles, symbol, timeframe) {
  if (!candles || candles.length < 30) return null;

  // només veles tancades → última és candles[candles.length - 2]
  const n = candles.length;
  const last = candles[n - 2];
  const prev1 = candles[n - 3];
  const prev2 = candles[n - 4];

  if (!last || !prev1 || !prev2) return null;

  // tendència simple amb EMA20 i EMA40
  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes.slice(-40), 20);
  const ema40 = calcEMA(closes.slice(-40), 40);
  if (!ema20 || !ema40) return null;

  const trendLong = ema20 > ema40;
  const trendShort = ema20 < ema40;
  if (!trendLong && !trendShort) return null;

  // MS/ES simples com a context
  const { ms, es } = detectMSES(candles);

  let direction = null;
  if (trendLong && ms) direction = "LONG";
  if (trendShort && es) direction = "SHORT";
  if (!direction) return null;

  // retracement: agafem prev1 i prev2 com a candidates
  const retraceHigh = Math.max(prev1.high, prev2.high);
  const retraceLow = Math.min(prev1.low, prev2.low);

  let confirmed = false;
  let type = null;
  let entry = null;

  if (direction === "LONG") {
    if (last.high > retraceHigh && last.close > retraceHigh) {
      confirmed = true;
      type = "MICRO_LONG";
      entry = last.close;
    }
  } else if (direction === "SHORT") {
    if (last.low < retraceLow && last.close < retraceLow) {
      confirmed = true;
      type = "MICRO_SHORT";
      entry = last.close;
    }
  }

  if (!confirmed) return null;

  const rawTs =
    normalizeTimestamp(last.timestamp) ??
    normalizeTimestamp(last.time) ??
    normalizeTimestamp(last.openTime) ??
    normalizeTimestamp(last.closeTime) ??
    normalizeTimestamp(last.t) ??
    normalizeTimestamp(last.ts) ??
    Date.now();

  const timestamp = rawTs; // ms

  return {
    symbol,
    timeframe,
    type,
    entry,
    timestamp,
    reason: "microimpulse",
    sensitivity: 40
  };
}
