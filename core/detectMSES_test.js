// core/detectMSES_test.js
// Test 1:1 amb la lògica actual del bot per OP-USDT

// =========================
// HELPERS
// =========================
function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }
function body(o, c) { return Math.abs(c - o); }
function range(h, l) { return h - l; }

function calcATRArray(candles, period = 14) {
  if (candles.length < period + 1) return [];
  const atrs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (i >= period) {
      const slice = atrs.slice(-(period - 1));
      const prevTRs = [...slice, tr];
      const atr = prevTRs.reduce((a, b) => a + b, 0) / prevTRs.length;
      atrs.push(atr);
    } else {
      atrs.push(tr);
    }
  }
  return atrs;
}

function sma(arr, period) {
  if (!arr || arr.length < period) return null;
  const slice = arr.slice(arr.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values, period) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  let emaArr = [];
  let prev = values[0];
  emaArr.push(prev);
  for (let i = 1; i < values.length; i++) {
    const v = values[i] * k + prev * (1 - k);
    emaArr.push(v);
    prev = v;
  }
  return emaArr;
}

// =========================
// detectMSES TEST VERSION
// =========================
export function detectMSES_test(candlesRaw, prevState = {}) {

  // CONFIG OP-USDT
  const useSlopeFilterMS    = false;
  const useSlopeFilterES    = false;
  const useTrendFilterES    = true;
  const useMagnitudeFilter  = false;
  const useVolatilityFilter = false;
  const window              = 14;

  if (!candlesRaw || candlesRaw.length < 10)
    return { signal: null, state: prevState };

  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);

  const n = candles.length;
  if (n < 5) return { signal: null, state: prevState };

  const curr = candles[n - 1];
  const c3   = candles[n - 2];
  const c2   = candles[n - 3];
  const c1   = candles[n - 4];

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

  // TREND
  const trendUp =
    curr.close > c3.close &&
    c3.close >= c2.close;

  const trendDown =
    curr.close < c3.close &&
    c3.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  let msFiltered = msCond && (trendUp || trendNeutral);
  let esFiltered = esCond && (trendDown || trendNeutral);

  // ATR / VOL
  const atrArr = calcATRArray(candles, 14);
  const atr14 = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  const atrSMA20 = sma(atrArr, 20);
  const volOK = atr14 && atrSMA20 ? atr14 > atrSMA20 : true;

  // EMA20 + SLOPE
  const closes = candles.map(c => c.close);
  const ema20Arr = ema(closes, 20);
  const ema20Last = ema20Arr[ema20Arr.length - 1];
  const ema20Prev = ema20Arr[ema20Arr.length - 2];
  const emaSlope = ema20Last - ema20Prev;

  if (useSlopeFilterMS)
    msFiltered = msFiltered && emaSlope > 0;

  if (useSlopeFilterES)
    esFiltered = esFiltered && emaSlope < 0;

  if (useTrendFilterES)
    esFiltered = esFiltered && curr.close < ema20Last && emaSlope < 0;

  if (useMagnitudeFilter && atr14) {
    msFiltered = msFiltered && Math.abs(c3.close - c3.open) > atr14 * 0.20;
    esFiltered = esFiltered && Math.abs(c3.close - c3.open) > atr14 * 0.20;
  }

  if (useVolatilityFilter)
    msFiltered = msFiltered && volOK;

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

  // =========================
  // LOG PER DEBUG
  // =========================
  console.log("----- VELA", new Date(curr.timestamp).toISOString(), "-----");
  console.log("msFiltered:", msFiltered, "esFiltered:", esFiltered);
  console.log("prevMs:", state.prevMsFiltered, "prevEs:", state.prevEsFiltered);
  console.log("lastMs:", state.lastMsFiltered, "lastEs:", state.lastEsFiltered);
  console.log("msHistory:", state.msHistory);
  console.log("esHistory:", state.esHistory);
  console.log("msCount:", msCount, "esCount:", esCount);
  console.log("msCluster:", msCluster, "esCluster:", esCluster);

  return { state };
}
