// core/patterns.js — VERSIÓ 1:1 TRADINGVIEW (MS, ES, FEBLES, DESCARTADES, CLÚSTERS)
import { client } from "../db/client.js";

// Helpers
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

// -------------------------------------------------------------
// CONTEXT BTC (score + label FIAT)
// -------------------------------------------------------------
export function computeBTCContext(candles) {
  if (!candles || candles.length < 40) {
    return { score: 0, label: "BTC_NOT_ENOUGH_DATA" };
  }

  // Treballem només amb veles TANCADES
  const closed = candles.slice(0, -1); // excloem la vela oberta
  const n = closed.length;

  // Mapping FIAT (igual que detectMSES)
  const c1 = closed[n - 1]; // 1a tancada
  const c2 = closed[n - 2]; // 2a tancada
  const c3 = closed[n - 3]; // 3a tancada

  // EMA FIAT (sense vela oberta)
  const closes = closed.map(c => c.close);
  const emaLen = 20;
  const emaFast = ema(closes, emaLen);
  const emaLast = emaFast[emaFast.length - 1];
  const emaPrev = emaFast[emaFast.length - 2];
  const emaSlope = emaLast - emaPrev;

  // ATR FIAT (sense vela oberta)
  const atrArr = calcATRArray(closed, 14);
  const atr14 = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  const atrSMA20 = sma(atrArr, 20);

  // Magnitud FIAT
  const body1 = body(c1.open, c1.close);
  const body2 = body(c2.open, c2.close);
  const body3 = body(c3.open, c3.close);
  const avgBody = (body1 + body2 + body3) / 3;

  // Flush FIAT
  const range1 = c1.high - c1.low;
  const upperWick1 = c1.high - Math.max(c1.open, c1.close);
  const lowerWick1 = Math.min(c1.open, c1.close) - c1.low;
  const wickRatio1 = range1 > 0 ? (upperWick1 + lowerWick1) / range1 : 0;

  // Tendència FIAT (igual que detectMSES)
  const trendUp =
    c1.close > c2.close &&
    c2.close >= c3.close;

  const trendDown =
    c1.close < c2.close &&
    c2.close <= c3.close;

  let score = 0;
  const flags = [];

  // 1) EMA slope
  const emaSlopeOK = Math.abs(emaSlope / emaLast) * 100 > 0.03;
  if (emaSlopeOK) score += 1;
  else flags.push("EMA_FLAT");

  // 2) ATR
  const atrOK = atr14 && atrSMA20 ? atr14 > atrSMA20 : false;
  if (atrOK) score += 1;
  else flags.push("LOW_ATR");

  // 3) Magnitud
  const magOK = atr14 ? avgBody > atr14 * 0.4 : false;
  if (magOK) score += 1;
  else flags.push("LOW_MAG");

  // 4) No flush
  const noFlush = wickRatio1 < 0.6;
  if (noFlush) score += 1;
  else flags.push("FLUSH");

  // 5) Tendència clara
  const trendOK = trendUp || trendDown;
  if (trendOK) score += 1;
  else flags.push("NO_TREND");

  const label = flags.length === 0 ? "BTC_GOOD" : "BTC_" + flags.join("_");

  return { score, label };
}


// -------------------------------------------------------------
// DETECT MSES COMPLET + FILTRE BTC
// -------------------------------------------------------------
export async function detectMSES(
  candlesRaw,
  symbol,
  timeframe,
  prevState = {},
  btcContext = null
) {
  if (!candlesRaw || candlesRaw.length < 10)
    return { signals: [], state: prevState };

  // Load config
  const cfgRes = await client.query(
    "SELECT * FROM config_crypto WHERE symbol = $1",
    [symbol]
  );
  if (cfgRes.rows.length === 0)
    return { signals: [], state: prevState };

  const cfg = cfgRes.rows[0];

  const useMagnitudeFilter  = cfg.cfgmagnitude;
  const useVolatilityFilter = cfg.cfgvol;
  const window              = cfg.cfgwindow;
  const distPctMax          = cfg.cfgdistpct;
  const cfgBTCExposure      = cfg.cfgbtcexposure || 0;

  const ratio  = 0.6;
  const emaLen = 20;

  // Sort candles
  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

  if (n < 7) return { signals: [], state: prevState };

  // Mapping 1:1 Pine
  const c0 = candles[n - 1];
  const c1 = candles[n - 2];
  const c2 = candles[n - 3];
  const c3 = candles[n - 4];

  // Indecisió
  const indecision = (mid, first) => {
    const r = first.high - first.low;
    if (r === 0) return true;
    return Math.abs(mid.close - mid.open) < r * 0.3;
  };

  // MS / ES condicions base
  const msCond =
    isBear(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBull(c1.open, c1.close);

  const esCond =
    isBull(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBear(c1.open, c1.close);

  // Tendència
  const trendUp =
    c0.close > c1.close &&
    c1.close >= c2.close;

  const trendDown =
    c0.close < c1.close &&
    c1.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  let msValid = msCond && (trendUp || trendNeutral);
  let esValid = esCond && (trendDown || trendNeutral);

  // Magnitud
  let msWeak = false;
  let esWeak = false;

  if (useMagnitudeFilter) {
    if (msValid || esValid) {
      const bodyFirst = Math.abs(c3.close - c3.open);
      const bodyThird = Math.abs(c1.close - c1.open);

      const magOK = bodyThird > bodyFirst * ratio;

      msWeak = msValid && !magOK;
      esWeak = esValid && !magOK;
    }
  }

  // EMA (només motiu)
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, emaLen);
  const emaLast = emaFast[emaFast.length - 2];

  const distPct = Math.abs((c0.close - emaLast) / emaLast) * 100;
  const failsDistPct = distPct > distPctMax;

  // Volatilitat
  const atrArr   = calcATRArray(candles, 14);
  const atr14    = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  const atrSMA20 = sma(atrArr, 20);
  const volOK    = atr14 && atrSMA20 ? atr14 > atrSMA20 : true;

  let msFiltered = msValid && !msWeak;
  let esFiltered = esValid && !esWeak;

  if (useVolatilityFilter) {
    msFiltered = msFiltered && volOK;
    esFiltered = esFiltered && volOK;
  }

  // -------------------------------------------------------------
  // FILTRE BTC (només descarta si hi havia senyal real)
  // -------------------------------------------------------------
  let btcDiscard = false;

  if (
    symbol !== "BTC-USDT" &&
    symbol !== "ETH-USDT" &&
    cfgBTCExposure > 0 &&
    btcContext
  ) {
    const scoreBad = btcContext.score < cfgBTCExposure;

    if (scoreBad) {
      btcDiscard = (msFiltered || esFiltered);
      msFiltered = false;
      esFiltered = false;
    }
  }

  // Motiu
  let motiu = "";
  if (msWeak || esWeak) motiu += "MAG+";
  if (failsDistPct)      motiu += "EMA+";
  if (btcDiscard)        motiu += "BTC+";
  if (motiu.endsWith("+")) motiu = motiu.slice(0, -1);

  // Estat
  const state = { ...prevState };

  if (state.prevMsFiltered === undefined) state.prevMsFiltered = false;
  if (state.prevEsFiltered === undefined) state.prevEsFiltered = false;

  if (state.prevMsWeak === undefined) state.prevMsWeak = false;
  if (state.prevEsWeak === undefined) state.prevEsWeak = false;

  const signals = [];
  const ts = c1.timestamp;

  // -------------------------------------------------------------
  // PIPELINE FIAT
  // -------------------------------------------------------------

  // 1) MS bona
  if (msFiltered && !state.prevMsFiltered) {
    signals.push({
      symbol, timeframe,
      type: "M",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu
    });
  }

  // 2) ES bona
  if (esFiltered && !state.prevEsFiltered) {
    signals.push({
      symbol, timeframe,
      type: "E",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu
    });
  }

  // 3) MS feble
  if (msWeak && !state.prevMsWeak) {
    signals.push({
      symbol, timeframe,
      type: "M_WEAK",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      reason: "MAG"
    });
  }

  // 4) ES feble
  if (esWeak && !state.prevEsWeak) {
    signals.push({
      symbol, timeframe,
      type: "E_WEAK",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      reason: "MAG"
    });
  }

  // 5) DESCARTS
  if (msValid && !msFiltered && !state.prevMsFiltered) {
    signals.push({
      symbol, timeframe,
      type: "DISCARD_MS",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu
    });
  }

  if (esValid && !esFiltered && !state.prevEsFiltered) {
    signals.push({
      symbol, timeframe,
      type: "DISCARD_ES",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      reason: motiu
    });
  }

  // 6) BTC_STATUS
  if (btcDiscard) {
    signals.push({
      symbol,
      timeframe,
      type: "BTC_STATUS",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      reason: "BTC"
    });
  }

  // Update state
  state.prevMsFiltered = msFiltered;
  state.prevEsFiltered = esFiltered;

  state.prevMsWeak = msWeak;
  state.prevEsWeak = esWeak;

  return { signals, state };
}
