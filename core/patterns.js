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
// MS / ES EXACTAMENT COM TRADINGVIEW (VERSIÓ CORRECTA)
// -------------------------------------------------------------
export function detectMSES(candles, symbol, timeframe, prevState = {}) {
  if (!candles || candles.length < 5) {
    return { signal: null, state: prevState };
  }

  // Ordenem per seguretat
  candles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

  // c1 = [3], c2 = [2], c3 = [1], curr = [0]
  const c1 = candles[n - 4];
  const c2 = candles[n - 3];
  const c3 = candles[n - 2];
  const curr = candles[n - 1]; // vela nova → moment en què TradingView genera la senyal

  const isBull = (o, c) => c > o;
  const isBear = (o, c) => c < o;
  const body = (o, c) => Math.abs(c - o);
  const range = (h, l) => h - l;

  const indecision = (o2, h1, l1, c2) => {
    const r1 = range(h1, l1);
    return r1 === 0 ? true : body(o2, c2) < r1 * 0.3;
  };

  // Condicions MS / ES
  const msCond =
    isBear(c1.open, c1.close) &&
    indecision(c2.open, c1.high, c1.low, c2.close) &&
    isBull(c3.open, c3.close);

  const esCond =
    isBull(c1.open, c1.close) &&
    indecision(c2.open, c1.high, c1.low, c2.close) &&
    isBear(c3.open, c3.close);

  // Tendència immediata (com TradingView)
  const trendUp =
    curr.close > c3.close &&
    c3.close >= c2.close;

  const trendDown =
    curr.close < c3.close &&
    c3.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  const msValid = msCond && (trendUp || trendNeutral);
  const esValid = esCond && (trendDown || trendNeutral);

  // Equivalent a not msCond[1]
  const prevMsCond = prevState.prevMsCond ?? false;
  const prevEsCond = prevState.prevEsCond ?? false;

  let signal = null;

  // IMPORTANT:
  // TradingView genera la senyal a l'obertura de la vela nova → curr.timestamp
  if (msValid && !prevMsCond) {
    signal = {
      symbol,
      timeframe,
      type: "MS_LONG",
      timestamp: curr.timestamp, // CORRECTE: timestamp de la vela nova
      entry: c3.close,
      reason: "ms",
    };
  }

  if (esValid && !prevEsCond) {
    signal = {
      symbol,
      timeframe,
      type: "MS_SHORT",
      timestamp: curr.timestamp, // CORRECTE: timestamp de la vela nova
      entry: c3.close,
      reason: "es",
    };
  }

  return {
    signal,
    state: {
      prevMsCond: msCond,
      prevEsCond: esCond,
    },
  };
}
