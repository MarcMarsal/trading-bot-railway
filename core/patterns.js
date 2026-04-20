// core/patterns.js — VERSIÓ SINCRONITZADA MS/ES AMB TRADINGVIEW (sense microimpulsos ni febles encara)
import { client } from "../db/client.js";

// Helpers bàsics
function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }
function body(o, c)   { return Math.abs(c - o); }

// ATR
function calcATRArray(candles, period = 14) {
  if (candles.length < period + 1) return [];
  const atrs = [];
  for (let i = 1; i < candles.length; i++) {
    const h  = candles[i].high;
    const l  = candles[i].low;
    const pc = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (i >= period) {
      const slice  = atrs.slice(-(period - 1));
      const prevTR = [...slice, tr];
      const atr    = prevTR.reduce((a, b) => a + b, 0) / prevTR.length;
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

// EMA
function ema(values, period) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArr = [];
  let prev = values[0];
  emaArr.push(prev);
  for (let i = 1; i < values.length; i++) {
    const v = values[i] * k + prev * (1 - k);
    emaArr.push(v);
    prev = v;
  }
  return emaArr;
}

export async function detectMSES(candlesRaw, symbol, timeframe, prevState = {}) {
  if (!candlesRaw || candlesRaw.length < 10)
    return { signal: null, state: prevState };

  // Carregar config de DB
  const cfgRes = await client.query(
    "SELECT * FROM config_crypto WHERE symbol = $1",
    [symbol]
  );
  if (cfgRes.rows.length === 0)
    return { signal: null, state: prevState };

  const cfg = cfgRes.rows[0];

  const useMagnitudeFilter  = cfg.cfgmagnitude;   // true/false
  const useVolatilityFilter = cfg.cfgvol;         // true/false
  const window              = cfg.cfgwindow;      // clusters
  const distPctMax          = cfg.cfgdistpct;     // ara només per motiu
  const debug               = cfg.cfgdebug;

  const ratio  = 0.6;  // igual que Pine
  const emaLen = 20;   // igual que Pine

  // Ordenar veles per timestamp
  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

  // Seguretat
  if (n < 7) return { signal: null, state: prevState };

  // Mapping 1:1 amb Pine:
  // c0 = última tancada (equivalent a close[0] a Pine)
  // c1 = close[1]
  // c2 = close[2]
  // c3 = close[3]
  const c0 = candles[n - 1];
  const c1 = candles[n - 2];
  const c2 = candles[n - 3];
  const c3 = candles[n - 4];

  if (debug) {
    console.log("=== DEBUG MSES ===");
    console.log("c3:", c3.timestamp, c3.open, c3.high, c3.low, c3.close);
    console.log("c2:", c2.timestamp, c2.open, c2.high, c2.low, c2.close);
    console.log("c1:", c1.timestamp, c1.open, c1.high, c1.low, c1.close);
    console.log("c0:", c0.timestamp, c0.open, c0.high, c0.low, c0.close);
    console.log("==================");
  }

  // Indecisió (mateix que Pine)
  const indecision = (mid, first) => {
    const r = first.high - first.low;
    if (r === 0) return true;
    return Math.abs(mid.close - mid.open) < r * 0.3;
  };

  // Condicions base MS / ES (Pine)
  const msCond =
    isBear(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBull(c1.open, c1.close);

  const esCond =
    isBull(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBear(c1.open, c1.close);

  // Tendència (Pine)
  const trendUp =
    c0.close > c1.close &&
    c1.close >= c2.close;

  const trendDown =
    c0.close < c1.close &&
    c1.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  let msValid = msCond && (trendUp || trendNeutral);
  let esValid = esCond && (trendDown || trendNeutral);

  // Magnitud (Pine)
  let msFiltered = msValid;
  let esFiltered = esValid;

  let msWeak = false;
  let esWeak = false;

  if (useMagnitudeFilter) {
    const bodyFirst = Math.abs(c3.close - c3.open);
    const bodyThird = Math.abs(c1.close - c1.open);
    const magOK = bodyThird > bodyFirst * ratio;

    msWeak     = msValid && !magOK;
    esWeak     = esValid && !magOK;
    msFiltered = msValid && magOK;
    esFiltered = esValid && magOK;
  }

  // EMA (només per motiu, NO filtre dur)
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, emaLen);
  const emaLast = emaFast[emaFast.length - 2]; // última tancada

  const distPct = Math.abs((c0.close - emaLast) / emaLast) * 100;
  const failsDistPct = distPct > distPctMax;

  // Volatilitat (Pine)
  const atrArr   = calcATRArray(candles, 14);
  const atr14    = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  const atrSMA20 = sma(atrArr, 20);
  const volOK    = atr14 && atrSMA20 ? atr14 > atrSMA20 : true;

  if (useVolatilityFilter) {
    msFiltered = msFiltered && volOK;
    esFiltered = esFiltered && volOK;
  }

  // Estat per a clusters (igual que abans)
  const state = { ...prevState };
  if (state.prevMsFiltered === undefined) state.prevMsFiltered = false;
  if (state.prevEsFiltered === undefined) state.prevEsFiltered = false;

  // Clústers (aprox. com abans; ja ho refinarem si cal 1:1 absolut)
  const msFlags = [];
  const esFlags = [];

  for (let i = n - window - 2; i <= n - 2; i++) {
    if (i < 5) continue;

    const x0 = candles[i];
    const x1 = candles[i - 1];
    const x2 = candles[i - 2];
    const x3 = candles[i - 3];

    const ms_i =
      isBear(x3.open, x3.close) &&
      indecision(x2, x3) &&
      isBull(x1.open, x1.close);

    const es_i =
      isBull(x3.open, x3.close) &&
      indecision(x2, x3) &&
      isBear(x1.open, x1.close);

    const trendUp_i =
      x0.close > x1.close &&
      x1.close >= x2.close;

    const trendDown_i =
      x0.close < x1.close &&
      x1.close <= x2.close;

    const trendNeutral_i = !trendUp_i && !trendDown_i;

    let msValid_i = ms_i && (trendUp_i || trendNeutral_i);
    let esValid_i = es_i && (trendDown_i || trendNeutral_i);

    msFlags.push(msValid_i ? 1 : 0);
    esFlags.push(esValid_i ? 1 : 0);
  }

  const msCount = msFlags.reduce((a, b) => a + b, 0);
  const esCount = esFlags.reduce((a, b) => a + b, 0);

  const msCluster =
    msCount >= 3 &&
    msFiltered &&
    !state.prevMsFiltered;

  const esCluster =
    esCount >= 3 &&
    esFiltered &&
    !state.prevEsFiltered;

  // Motiu (MAG / EMA) — ja preparat per quan vulguem guardar-ho
  let motiu = "";
  if (msWeak || esWeak) motiu += "MAG+";
  if (failsDistPct)      motiu += "EMA+";

  if (motiu.endsWith("+"))
    motiu = motiu.slice(0, -1);

  // Descarts (encara no els retornem com a senyal, però ja els tenim calculats)
  const isDiscardedMS = msValid && !msFiltered;
  const isDiscardedES = esValid && !esFiltered;

  // Construir senyal principal (per ara: M, E, CLUSTER_UP, CLUSTER_DOWN)
  let signal = null;
  const signalTimestamp = c1.timestamp; // equivalent a bar_index[1]

  // MS bona
  if (msFiltered && !state.prevMsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "M",
      timestamp: signalTimestamp,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu || null
    };
  }

  // ES bona
  if (esFiltered && !state.prevEsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "E",
      timestamp: signalTimestamp,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu || null
    };
  }

  // CLÚSTERS
  if (msCluster) {
    signal = {
      symbol,
      timeframe,
      type: "CLUSTER_UP",
      timestamp: signalTimestamp,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu || null
    };
  }

  if (esCluster) {
    signal = {
      symbol,
      timeframe,
      type: "CLUSTER_DOWN",
      timestamp: signalTimestamp,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu || null
    };
  }

  // Actualitzar estat
  state.prevMsFiltered = msFiltered;
  state.prevEsFiltered = esFiltered;

  return { signal, state };
}
