// core/patterns.js
import { client } from "../db/client.js";

// =========================
// HELPERS
// =========================
function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }
function body(o, c) { return Math.abs(c - o); }
function range(h, l) { return h - l; }

// ATR (simple version)
function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;

  let trs = [];
  for (let i = candles.length - period - 1; i < candles.length - 1; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    const tr = Math.max(
      h - l,
      Math.abs(h - pc),
      Math.abs(l - pc)
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

// SMA
function sma(arr, period) {
  if (arr.length < period) return null;
  const slice = arr.slice(arr.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// =========================
// MAIN FUNCTION
// =========================
export async function detectMSES(candles, symbol, timeframe, prevState = {}) {
  if (!candles || candles.length < 20) {
    return { signal: null, state: prevState };
  }

  // -------------------------
  // LOAD CONFIG FROM DB
  // -------------------------
  const cleanSymbol = symbol.replace("-", "");
  const cfgRes = await client.query(
    "SELECT * FROM config_crypto WHERE symbol = $1",
    [cleanSymbol]
  );
  if (cfgRes.rows.length === 0) {
    console.log("No config for", cleanSymbol);
    return { signal: null, state: prevState };
  }

  const cfg = cfgRes.rows[0];

  const useSlopeFilterMS = cfg.cfgslopems;
  const useSlopeFilterES = cfg.cfgslopes;
  const useTrendFilterES = cfg.cfgtrendes;
  const useMagnitudeFilter = cfg.cfgmagnitude;
  const useVolatilityFilter = cfg.cfgvol;
  const window = cfg.cfgwindow;
  const distPctMax = cfg.cfgdistpct;

  // -------------------------
  // SORT CANDLES
  // -------------------------
  candles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

  const curr = candles[n - 1];     // vela en formació
  const c3 = candles[n - 2];       // tercera vela (última tancada)
  const c2 = candles[n - 3];
  const c1 = candles[n - 4];

  if (!curr || !c3 || !c2 || !c1) {
    return { signal: null, state: prevState };
  }

  // -------------------------
  // BASE MS / ES CONDITIONS
  // -------------------------
  const indecision = (o2, h1, l1, c2) => {
    const r1 = range(h1, l1);
    return r1 === 0 ? true : body(o2, c2) < r1 * 0.3;
  };

  const msCond =
    isBear(c1.open, c1.close) &&
    indecision(c2.open, c1.high, c1.low, c2.close) &&
    isBull(c3.open, c3.close);

  const esCond =
    isBull(c1.open, c1.close) &&
    indecision(c2.open, c1.high, c1.low, c2.close) &&
    isBear(c3.open, c3.close);

  // -------------------------
  // TREND
  // -------------------------
  const trendUp =
    c3.close > c2.close &&
    c2.close >= c1.close;

  const trendDown =
    c3.close < c2.close &&
    c2.close <= c1.close;

  const trendNeutral = !trendUp && !trendDown;

  let msFiltered = msCond && (trendUp || trendNeutral);
  let esFiltered = esCond && (trendDown || trendNeutral);

  // -------------------------
  // ATR / VOLATILITY
  // -------------------------
  const atr14 = calcATR(candles, 14);
  const atrSMA20 = sma(
    candles.slice(-40).map(c => calcATR(candles.slice(0, candles.indexOf(c) + 1), 14) || 0),
    20
  );

  const volOK = atr14 && atrSMA20 ? atr14 > atrSMA20 : true;

  // -------------------------
  // EMA20 + SLOPE
  // -------------------------
  const closes = candles.map(c => c.close);
  const ema20 = ema(closes, 20);
  const emaSlope = ema20[ema20.length - 1] - ema20[ema20.length - 2];

  // -------------------------
  // APPLY FILTERS
  // -------------------------
  if (useSlopeFilterMS) {
    msFiltered = msFiltered && emaSlope > 0;
  }

  if (useSlopeFilterES) {
    esFiltered = esFiltered && emaSlope < 0;
  }

  if (useTrendFilterES) {
    esFiltered = esFiltered && c3.close < ema20[ema20.length - 1] && emaSlope < 0;
  }

  if (useMagnitudeFilter && atr14) {
    msFiltered = msFiltered && Math.abs(c3.close - c3.open) > atr14 * 0.20;
    esFiltered = esFiltered && Math.abs(c3.close - c3.open) > atr14 * 0.20;
  }

  if (useVolatilityFilter) {
    msFiltered = msFiltered && volOK;
    esFiltered = esFiltered && volOK;
  }

  // -------------------------
  // CLUSTERS
  // -------------------------
  const state = { ...prevState };

  if (!state.msHistory) state.msHistory = [];
  if (!state.esHistory) state.esHistory = [];

  state.msHistory.push(msFiltered ? 1 : 0);
  if (state.msHistory.length > window) state.msHistory.shift();

  state.esHistory.push(esFiltered ? 1 : 0);
  if (state.esHistory.length > window) state.esHistory.shift();

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

  // -------------------------
  // BUILD SIGNAL
  // -------------------------
  let signal = null;

  // MS normal
  if (msFiltered && !state.prevMsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "MS_LONG",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "ms",
      thirdCandle: c3
    };
  }

  // ES normal
  if (esFiltered && !state.prevEsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "MS_SHORT",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "es",
      thirdCandle: c3
    };
  }

  // MS CLUSTER
  if (msCluster) {
    signal = {
      symbol,
      timeframe,
      type: "MS_CLUSTER_LONG",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "cluster",
      thirdCandle: c3
    };
  }

  // ES CLUSTER
  if (esCluster) {
    signal = {
      symbol,
      timeframe,
      type: "MS_CLUSTER_SHORT",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "cluster",
      thirdCandle: c3
    };
  }

  // -------------------------
  // SAVE STATE
  // -------------------------
  state.prevMsFiltered = msFiltered;
  state.prevEsFiltered = esFiltered;

  return { signal, state };
}

// =========================
// SIMPLE EMA
// =========================
function ema(values, period) {
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
