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
// MS / ES EXACTAMENT COM TRADINGVIEW (CORREGIT)
// -------------------------------------------------------------
export function detectMSES(candles, symbol, timeframe) {
  if (!candles || candles.length < 5) return null;

  const n = candles.length;

  // ✔️ Índexos corregits per coincidir amb open[3], open[2], open[1]
  const prev3 = candles[n - 4]; // open[3]
  const prev2 = candles[n - 3]; // open[2]
  const prev1 = candles[n - 2]; // open[1]
  const current = candles[n - 1]; // vela actual (només per pintar)

  if (!prev1 || !prev2 || !prev3) return null;

  const isBull = (o, c) => c > o;
  const isBear = (o, c) => c < o;
  const body = (o, c) => Math.abs(c - o);
  const range = (h, l) => h - l;

  const indecision = (o2, h1, l1, c2) => {
    const r1 = range(h1, l1);
    if (r1 === 0) return true;
    return body(o2, c2) < r1 * 0.3;
  };

  const mid1 = (prev3.open + prev3.close) / 2;

  const msCond =
    isBear(prev3.open, prev3.close) &&
    indecision(prev2.open, prev3.high, prev3.low, prev2.close) &&
    isBull(prev1.open, prev1.close) &&
    prev1.close > mid1;

  const esCond =
    isBull(prev3.open, prev3.close) &&
    indecision(prev2.open, prev3.high, prev3.low, prev2.close) &&
    isBear(prev1.open, prev1.close) &&
    prev1.close < mid1;

  if (msCond) {
    return {
      symbol,
      timeframe,
      type: "MS_LONG",
      timestamp: prev1.timestamp, // ✔️ la vela on TradingView pinta la M
      entry: prev1.close,
      reason: "ms",
    };
  }

  if (esCond) {
    return {
      symbol,
      timeframe,
      type: "MS_SHORT",
      timestamp: prev1.timestamp, // ✔️ la vela on TradingView pinta la E
      entry: prev1.close,
      reason: "es",
    };
  }

  return null;
}


