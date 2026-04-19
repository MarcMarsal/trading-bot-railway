// core/detectMSES_test.js
// Versió final per OP-USDT, 1:1 amb la lògica del bot

// Helpers
function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }
function body(o, c) { return Math.abs(c - o); }
function range(h, l) { return h - l; }

export async function detectMSES_test(candlesRaw, symbol, timeframe, prevState = {}) {

  // CONFIG OP-USDT
  const useSlopeFilterMS    = false;
  const useSlopeFilterES    = false;
  const useTrendFilterES    = true;
  const useMagnitudeFilter  = false;
  const useVolatilityFilter = false;
  const window              = 14;

  if (!candlesRaw || candlesRaw.length < 5)
    return { signal: null, state: prevState };

  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);

  const n = candles.length;
  //const curr = candles[n - 1];
  //const c3   = candles[n - 2];
  //const c2   = candles[n - 3];
  //const c1   = candles[n - 4];
  const curr = candles[n - 1];   // close[0]
  const c1   = candles[n - 2];   // close[1]
  const c2   = candles[n - 3];   // close[2]
  const c3   = candles[n - 4];   // close[3]

  
  // =========================
  // MS / ES BASE CONDITIONS
  // =========================
  const indecision = (o2, h1, l1, c2close) => {
    const r1 = range(h1, l1);
    return r1 === 0 ? true : body(o2, c2close) < r1 * 0.3;
  };

  const msCond =
    isBear(c1.open, c1.close) &&
    indecision(c2.open, c1.high, c1.low, c2.close) &&
    isBull(c3.open, c3.close);

  const esCond =
    isBull(c1.open, c1.close) &&
    indecision(c2.open, c1.high, c1.low, c2.close) &&
    isBear(c3.open, c3.close);

  const trendUp =
    curr.close > c3.close &&
    c3.close >= c2.close;

  const trendDown =
    curr.close < c3.close &&
    c3.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  let msFiltered = msCond && (trendUp || trendNeutral);
  let esFiltered = esCond && (trendDown || trendNeutral);

  // =========================
  // STATE (VELA TANCADA)
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
  // VELA NOVA
  // =========================
  if (curr.timestamp !== state.lastTimestamp) {

    // 1) Guardem la vela TANCADA (last)
    const closedMs = state.lastMsFiltered;
    const closedEs = state.lastEsFiltered;

    state.msHistory.push(closedMs ? 1 : 0);
    if (state.msHistory.length > window) state.msHistory.shift();

    state.esHistory.push(closedEs ? 1 : 0);
    if (state.esHistory.length > window) state.esHistory.shift();

    // 2) prev = closed
    state.prevMsFiltered = closedMs;
    state.prevEsFiltered = closedEs;

    // 3) last = valor actual
    state.lastMsFiltered = msFiltered;
    state.lastEsFiltered = esFiltered;

    state.lastTimestamp = curr.timestamp;
  }

  // =========================
  // COUNTS
  // =========================
  const msCount = state.msHistory.reduce((a, b) => a + b, 0);
  const esCount = state.esHistory.reduce((a, b) => a + b, 0);

  const msCluster =
    msCount >= 3 &&
    msFiltered &&
    !state.prevMsFiltered;

  const esCluster =
    esCount >= 3 &&
    esFiltered &&
    !state.prevEsFiltered;

  if (msFiltered && !state.prevMsFiltered)
    signal = { type: "MS (UP)", timestamp: curr.timestamp };

  if (esFiltered && !state.prevEsFiltered)
    signal = { type: "MS (DOWN)", timestamp: curr.timestamp };

  if (msCluster)
    signal = { type: "CLUSTER (UP)", timestamp: curr.timestamp };

  if (esCluster)
    signal = { type: "CLUSTER (DOWN)", timestamp: curr.timestamp };

  return { signal, state };
}

