// core/patterns.js

export function body(o, c) {
  return Math.abs(c - o);
}

export function range(h, l) {
  return h - l;
}

export function bodyPct(o, h, l, c) {
  const r = range(h, l);
  return r === 0 ? 0 : body(o, c) / r;
}

export function isBull(o, c) {
  return c > o;
}

export function isBear(o, c) {
  return c < o;
}

export function velaCompleta(v) {
  return (
    v &&
    v.open != null &&
    v.close != null &&
    v.high != null &&
    v.low != null &&
    v.timestamp != null
  );
}

// -------------------------------------------------------------
// MS / ES EXACTAMENT COM TRADINGVIEW
// -------------------------------------------------------------
export function detectMSES(candles, symbol, timeframe) {
  if (!candles || candles.length < 4) return null;

  const n = candles.length;
  const v1 = candles[n - 4];
  const v2 = candles[n - 3];
  const v3 = candles[n - 2];

  if (!v1 || !v2 || !v3) return null;

  const isBull = (v) => v.close > v.open;
  const isBear = (v) => v.close < v.open;

  const body = (v) => Math.abs(v.close - v.open);
  const range = (v) => v.high - v.low;

  const indecision = (v) => {
    const r = range(v);
    if (r === 0) return true;
    return body(v) / r <= 0.3;
  };

  const midpoint = (v1.open + v1.close) / 2;

  const ms =
    isBear(v1) &&
    indecision(v2) &&
    isBull(v3) &&
    v3.close > midpoint;

  const es =
    isBull(v1) &&
    indecision(v2) &&
    isBear(v3) &&
    v3.close < midpoint;

  if (ms) {
    return {
      symbol,
      timeframe,
      type: "MS_LONG",
      timestamp: v3.timestamp,
      entry: null,
      reason: "ms"
    };
  }

  if (es) {
    return {
      symbol,
      timeframe,
      type: "MS_SHORT",
      timestamp: v3.timestamp,
      entry: null,
      reason: "es"
    };
  }

  return null;
}
