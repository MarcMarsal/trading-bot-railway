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
  if (!candlesRaw || candlesRaw.length < 30) {
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

  const useSlopeFilterMS    = cfg.cfgslopems;
  const useSlopeFilterES    = cfg.cfgslopes;
  const useTrendFilterES    = cfg.cfgtrendes;
  const useMagnitudeFilter  = cfg.cfgmagnitude;
  const useVolatilityFilter = cfg.cfgvol;
  const window              = cfg.cfgwindow;
  const distPctMax          = cfg.cfgdistpct; // (només per microimpulsos a l’indicador)

  // -------------------------
  // SORT CANDLES & USE ONLY CLOSED ONES
  // -------------------------
  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);

  // assumim que l’última pot estar oberta → la ignorem per replicar TradingView
  if (candles.length < 5) {
    return { signal: null, state: prevState };
  }
  candles = candles.slice(0, candles.length - 1); // només veles tancades

  const n = candles.length;
  if (n < 5) {
    return { signal: null, state: prevState };
  }

  // índexs equivalents a Pine:
  // close   = candles[n-1]
  // close[1]= candles[n-2]
  // close[2]= candles[n-3]
  // close[3]= candles[n-4]
  const curr = candles[n - 1]; // close
  const c3   = candles[n - 2]; // close[1]
  const c2   = candles[n - 3]; // close[2]
  const c1   = candles[n - 4]; // close[3]

  if (!curr || !c3 || !c2 || !c1) {
    return { signal: null, state: prevState };
  }

  // -------------------------
  // BASE MS / ES CONDITIONS (IDÈNTIC A PINE)
// o1 = open[3], h1 = high[3], l1 = low[3], c1 = close[3]
// o2 = open[2], h2 = high[2], l2 = low[2], c2 = close[2]
// o3 = open[1], h3 = high[1], l3 = low[1], c3 = close[1]
// msCond = isBear(o1,c1) and |c2-o2| < (h1-l1)*0.3 and isBull(o3,c3)
// esCond = isBull(o1,c1) and |c2-o2| < (h1-l1)*0.3 and isBear(o3,c3)
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
  // TENDÈNCIA (IDÈNTIC A PINE)
// trendUp   = close > close[1] and close[1] >= close[2]
// trendDown = close < close[1] and close[1] <= close[2]
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
  // ATR / VOLATILITY (mateix concepte que ta.atr + ta.sma)
// es calcula sobre veles tancades
// -------------------------
  const atrArr = calcATRArray(candles, 14);
  const atr14 = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  const atrSMA20 = sma(atrArr, 20);
  const volOK = atr14 && atrSMA20 ? atr14 > atrSMA20 : true;

  // -------------------------
  // EMA20 + SLOPE (IDÈNTIC CONCEPTE A L’INDICADOR)
// ema sobre closes de veles tancades
// -------------------------
  const closes = candles.map(c => c.close);
  const ema20Arr = ema(closes, 20);
  const ema20Last = ema20Arr[ema20Arr.length - 1];
  const ema20Prev = ema20Arr[ema20Arr.length - 2];
  const emaSlope = ema20Last - ema20Prev;

  // -------------------------
  // APPLY FILTERS (IDÈNTICS A PINE)
// msFiltered = msValid
// esFiltered = esValid
// + slope, trendES, magnitude, vol
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
  // CLUSTERS (MATEIX CONCEPTE QUE TA.SMA * WINDOW)
// msCount = ta.sma(msFiltered ? 1 : 0, window) * window
// esCount = ta.sma(esFiltered ? 1 : 0, window) * window
// msCluster = msCount >= 3 and msFiltered and not msFiltered[1]
// esCluster = esCount >= 3 and esFiltered and not esFiltered[1]
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
  // BUILD SIGNAL (MATEIX TIPUS QUE L’INDICADOR)
// labels a Pine es pinten a bar_index[1] → entry = c3.close
// -------------------------
  let signal = null;

  // MS normal (alcista)
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

  // ES normal (baixista)
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

  // MS CLUSTER (alcista)
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

  // ES CLUSTER (baixista)
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

  // -------------------------
  // SAVE STATE
  // -------------------------
  state.prevMsFiltered = msFiltered;
  state.prevEsFiltered = esFiltered;

  return { signal, state };
}
