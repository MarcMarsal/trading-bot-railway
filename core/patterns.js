// core/patterns.js
import { client } from "../db/client.js";

// =========================
// HELPERS
// =========================
function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }
function body(o, c) { return Math.abs(c - o); }
function range(h, l) { return h - l; }

// ATR array (equivalent ta.atr(14))
function calcATRArray(candles, period = 14) {
  if (candles.length < period + 1) return [];
  const atrs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    const tr = Math.max(
      h - l,
      Math.abs(h - pc),
      Math.abs(l - pc)
    );
    if (i >= period) {
      const slice = atrs.slice(- (period - 1));
      const prevTRs = [...slice, tr];
      const atr = prevTRs.reduce((a, b) => a + b, 0) / prevTRs.length;
      atrs.push(atr);
    } else {
      atrs.push(tr);
    }
  }
  return atrs;
}

// SMA
function sma(arr, period) {
  if (!arr || arr.length < period) return null;
  const slice = arr.slice(arr.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// SIMPLE EMA (per ema20)
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
// MAIN FUNCTION
// =========================
export async function detectMSES(candlesRaw, symbol, timeframe, prevState = {}) {
  if (!candlesRaw || candlesRaw.length < 10) {
    return { signal: null, state: prevState };
  }

  // -------------------------
  // LOAD CONFIG FROM DB
  // -------------------------
  const cfgRes = await client.query(
    "SELECT * FROM config_crypto WHERE symbol = $1",
    [symbol]
  );
  if (cfgRes.rows.length === 0) {
    console.log("No config for", symbol);
    return { signal: null, state: prevState };
  }

  const cfg = cfgRes.rows[0];

  const useSlopeFilterMS    = cfg.cfgslopems;
  const useSlopeFilterES    = cfg.cfgslopees;
  const useTrendFilterES    = cfg.cfgtrendes;
  const useMagnitudeFilter  = cfg.cfgmagnitude;
  const useVolatilityFilter = cfg.cfgvol;
  const window              = cfg.cfgwindow;

  // -------------------------
  // CANDLES ORDENADES
  // -------------------------
  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);
  if (candles.length < 5) return { signal: null, state: prevState };

  const n = candles.length;
  if (n < 5) return { signal: null, state: prevState };

  // Pine equivalence:
  const curr = candles[n - 1]; // close[0]
  const c3   = candles[n - 2]; // close[1]
  const c2   = candles[n - 3]; // close[2]
  const c1   = candles[n - 4]; // close[3]

  // -------------------------
  // BASE MS / ES CONDITIONS
  // -------------------------
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

  // -------------------------
  // TREND (IDENTICAL TO PINE)
  // -------------------------
  const trendUp =
    curr.close > c3.close &&
    c3.close >= c2.close;

  const trendDown =
    curr.close < c3.close &&
    c3.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  let msValid = msCond && (trendUp || trendNeutral);
  let esValid = esCond && (trendDown || trendNeutral);

  // -------------------------
  // ATR / VOLATILITY
  // -------------------------
  const atrArr = calcATRArray(candles, 14);
  const atr14 = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  const atrSMA20 = sma(atrArr, 20);
  const volOK = atr14 && atrSMA20 ? atr14 > atrSMA20 : true;

  // -------------------------
  // EMA20 + SLOPE
  // -------------------------
  const closes = candles.map(c => c.close);
  const ema20Arr = ema(closes, 20);
  const ema20Last = ema20Arr[ema20Arr.length - 1];
  const ema20Prev = ema20Arr[ema20Arr.length - 2];
  const emaSlope = ema20Last - ema20Prev;

  // -------------------------
  // APPLY FILTERS
  // -------------------------
  let msFiltered = msValid;
  let esFiltered = esValid;

  if (useSlopeFilterMS) {
    msFiltered = msFiltered && emaSlope > 0;
  }

  if (useSlopeFilterES) {
    esFiltered = esFiltered && emaSlope < 0;
  }

  if (useTrendFilterES) {
    esFiltered = esFiltered && curr.close < ema20Last && emaSlope < 0;
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
  // CLUSTERS (VELA TANCADA)
  // -------------------------
  const state = { ...prevState };

  if (!state.msHistory) state.msHistory = [];
  if (!state.esHistory) state.esHistory = [];

  if (!state.lastTimestamp) state.lastTimestamp = 0;
  if (state.lastMsFiltered === undefined) state.lastMsFiltered = false;
  if (state.lastEsFiltered === undefined) state.lastEsFiltered = false;
  if (state.prevMsFiltered === undefined) state.prevMsFiltered = false;
  if (state.prevEsFiltered === undefined) state.prevEsFiltered = false;

  // NOMÉS ACTUALITZEM ESTAT I HISTÒRIC QUAN CANVIA LA VELA
  if (curr.timestamp !== state.lastTimestamp) {

    // 1) Guardem la vela TANCADA (last) a l’historial
    const closedMs = state.lastMsFiltered;
    const closedEs = state.lastEsFiltered;

    state.msHistory.push(closedMs ? 1 : 0);
    if (state.msHistory.length > window) state.msHistory.shift();

    state.esHistory.push(closedEs ? 1 : 0);
    if (state.esHistory.length > window) state.esHistory.shift();

    // 2) Ara prev = closed (equivalent a msFiltered[1])
    state.prevMsFiltered = closedMs;
    state.prevEsFiltered = closedEs;

    // 3) I last = valor de la vela actual (equivalent a msFiltered)
    state.lastMsFiltered = msFiltered;
    state.lastEsFiltered = esFiltered;

    state.lastTimestamp = curr.timestamp;
}


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

  if (msFiltered && !state.prevMsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "MS (UP)",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "ms",
      thirdCandle: c3,
      secondCandle: c2
    };
  }

  if (esFiltered && !state.prevEsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "MS (DOWN)",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "es",
      thirdCandle: c3,
      secondCandle: c2
    };
  }

  if (msCluster) {
    signal = {
      symbol,
      timeframe,
      type: "CLUSTER (UP)",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "cluster",
      thirdCandle: c3,
      secondCandle: c2
    };
  }

  if (esCluster) {
    signal = {
      symbol,
      timeframe,
      type: "CLUSTER (DOWN)",
      timestamp: curr.timestamp,
      entry: c3.close,
      reason: "cluster",
      thirdCandle: c3,
      secondCandle: c2
    };
  }

  return { signal, state };
}
