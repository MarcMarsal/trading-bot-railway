// ===============================================
// detectMSES_test.js
// Versió final 1:1 amb TradingView (temps real)
// ===============================================

// Helpers
function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }
function body(o, c) { return Math.abs(c - o); }
function range(h, l) { return h - l; }

// ===============================
// CONFIG PER SÍMBOLS
// ===============================
function getConfig(symbol) {
  switch (symbol) {
    case "APT-USDT":
    case "APTUSDT":
      return {
        slopeMS: false,
        slopeES: false,
        trendES: false,
        magnitude: false,
        vol: false,
        window: 14,
        distPct: 0.6
      };
  }

  return {
    slopeMS: false,
    slopeES: false,
    trendES: false,
    magnitude: false,
    vol: false,
    window: 14,
    distPct: 0.6
  };
}

// ===============================
// DETECT MSES TEST (temps real)
// ===============================
export async function detectMSES_test(candlesRaw, symbol, timeframe, prevState = {}) {

  const cfg = getConfig(symbol);
  const window = cfg.window;

  // Necessitem mínim 4 veles per MS/ES
  if (!candlesRaw || candlesRaw.length < 4)
    return { signal: null, state: prevState };

  // NOMÉS les últimes 4 veles (temps real)
  const candles = candlesRaw.slice(-4);
  const n = candles.length;

  const curr = candles[n - 1];
  const c1   = candles[n - 2];
  const c2   = candles[n - 3];
  const c3   = candles[n - 4];

  // =========================
  // MS / ES BASE CONDITIONS
  // =========================
  const indecision = (o2, h1, l1, c2close) => {
    const r1 = range(h1, l1);
    return r1 === 0 ? true : body(o2, c2close) < r1 * 0.3;
  };

  const msCond =
    isBear(c3.open, c3.close) &&
    indecision(c2.open, c3.high, c3.low, c2.close) &&
    isBull(c1.open, c1.close);

  const esCond =
    isBull(c3.open, c3.close) &&
    indecision(c2.open, c3.high, c3.low, c2.close) &&
    isBear(c1.open, c1.close);

  const trendUp =
    curr.close > c1.close &&
    c1.close >= c2.close;

  const trendDown =
    curr.close < c1.close &&
    c1.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  const msFiltered = msCond && (trendUp || trendNeutral);
  const esFiltered = esCond && (trendDown || trendNeutral);

  // =========================
  // STATE
  // =========================
  const state = { ...prevState };

  if (!state.msHistory) state.msHistory = [];
  if (!state.esHistory) state.esHistory = [];

  if (state.lastTimestamp === undefined) state.lastTimestamp = 0;
  if (state.lastMsFiltered === undefined) state.lastMsFiltered = false;
  if (state.lastEsFiltered === undefined) state.lastEsFiltered = false;
  if (state.prevMsFiltered === undefined) state.prevMsFiltered = false;
  if (state.prevEsFiltered === undefined) state.prevEsFiltered = false;

  let signal = null;

  // =========================
  // VELA NOVA (temps real)
  // =========================
  if (curr.timestamp !== state.lastTimestamp) {

    const closedMs = state.lastMsFiltered;
    const closedEs = state.lastEsFiltered;

    state.msHistory.push(closedMs ? 1 : 0);
    if (state.msHistory.length > window) state.msHistory.shift();

    state.esHistory.push(closedEs ? 1 : 0);
    if (state.esHistory.length > window) state.esHistory.shift();

    state.prevMsFiltered = closedMs;
    state.prevEsFiltered = closedEs;

    state.lastMsFiltered = msFiltered;
    state.lastEsFiltered = esFiltered;

    state.lastTimestamp = curr.timestamp;
  }

  // =========================
  // COUNTS (MODE TRADINGVIEW)
  // =========================
  const msClosedCount = state.msHistory.reduce((a, b) => a + b, 0);
  const msCount = msClosedCount + (msFiltered ? 1 : 0);

  const esClosedCount = state.esHistory.reduce((a, b) => a + b, 0);
  const esCount = esClosedCount + (esFiltered ? 1 : 0);

  // =========================
  // CLÚSTER (MODE TRADINGVIEW)
  // =========================
  const msCluster =
    msCount >= 3 &&
    msFiltered &&
    !esFiltered;

  const esCluster =
    esCount >= 3 &&
    esFiltered &&
    !msFiltered;

  // =========================
  // SENYALS
  // =========================
  if (msFiltered && !state.prevMsFiltered)
    signal = { type: "MS (UP)", timestamp: curr.timestamp };

  if (esFiltered && !state.prevEsFiltered)
    signal = { type: "ES (DOWN)", timestamp: curr.timestamp };

  if (msCluster)
    signal = { type: "CLUSTER (UP)", timestamp: curr.timestamp };

  if (esCluster)
    signal = { type: "CLUSTER (DOWN)", timestamp: curr.timestamp };

  return { signal, state };
}
