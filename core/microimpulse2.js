// core/microimpulse2.js

function normalizeTimestamp(raw) {
  // Si no existeix → invalid
  if (raw === undefined || raw === null) return null;

  // Si no és número → invalid
  if (typeof raw !== "number") return null;

  // Si és 0 → invalid
  if (raw === 0) return null;

  // Si és massa petit → invalid (UNIX real > 1.000.000.000)
  if (raw < 1000000000) return null;

  return raw;
}
function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function getTrendDirection(reliability) {
  if (reliability.trendPercent >= 50 && reliability.msPercent < 50) {
    return reliability.trendLabel === "LONG" || reliability.msNow ? "LONG" : "SHORT";
  }
  return null;
}

function isSmallRetraceCandle(candle, direction, ema20, maxDistancePct = 0.5) {
  const { open, close, high, low } = candle;
  const body = Math.abs(close - open);
  const range = high - low;
  if (range === 0) return false;

  const bodyPct = (body / range) * 100;
  if (bodyPct > 40) return false;

  const isRed = close < open;
  const isGreen = close > open;

  if (direction === "LONG" && !isRed) return false;
  if (direction === "SHORT" && !isGreen) return false;

  const mid = (high + low) / 2;
  const distPct = Math.abs((mid - ema20) / ema20) * 100;
  if (distPct > maxDistancePct) return false;

  return true;
}

function detectMicroimpulse(candles, reliability, symbol, timeframe) {
  if (!candles || candles.length < 30) return null;

  const direction = getTrendDirection(reliability);
  if (!direction) return null;

  if (reliability.trendPercent < 50) return null;
  if (reliability.msPercent >= 50) return null;
  if (!reliability.volumeOK) return null;

  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes.slice(-25), 20);
  if (!ema20) return null;

  const last = candles[candles.length - 1];
  const prev1 = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const retraceCandidates = [];
  if (isSmallRetraceCandle(prev1, direction, ema20)) retraceCandidates.push(prev1);
  if (isSmallRetraceCandle(prev2, direction, ema20)) retraceCandidates.push(prev2);

  if (retraceCandidates.length === 0) return null;

  const retraceHigh = Math.max(...retraceCandidates.map(c => c.high));
  const retraceLow = Math.min(...retraceCandidates.map(c => c.low));

  let isConfirmed = false;
  let type = null;
  let entry = null;

  if (direction === "LONG") {
    if (last.high > retraceHigh && last.close > retraceHigh) {
      isConfirmed = true;
      type = "MICRO_LONG";
      entry = last.close;
    }
  } else if (direction === "SHORT") {
    if (last.low < retraceLow && last.close < retraceLow) {
      isConfirmed = true;
      type = "MICRO_SHORT";
      entry = last.close;
    }
  }

  if (!isConfirmed) return null;

 const rawTs =
  normalizeTimestamp(last.timestamp) ??
  normalizeTimestamp(last.time) ??
  normalizeTimestamp(last.openTime) ??
  normalizeTimestamp(last.closeTime) ??
  normalizeTimestamp(last.t) ??
  normalizeTimestamp(last.ts) ??
  Date.now();

const timestamp = rawTs;   // rawTs ja és en mil·lisegons

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

export { detectMicroimpulse };
