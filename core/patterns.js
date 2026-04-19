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

// SIMPLE EMA (per ema20 / emaFast)
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

  const useSlopeFilterMS    = cfg.cfgslopems;     // NO l’aplicarem (Pine no el fa servir)
  const useSlopeFilterES    = cfg.cfgslopees;     // NO l’aplicarem
  const useTrendFilterES    = cfg.cfgtrendes;     // ja està implícit al Pine amb trendDown
  const useMagnitudeFilter  = cfg.cfgmagnitude;   // al Pine és magOK amb ratio; aquí el deixem com fins ara
  const useVolatilityFilter = cfg.cfgvol;
  const window              = cfg.cfgwindow;
  const debug               = cfg.cfgdebug;

  // -------------------------
  // CANDLES ORDENADES
  // -------------------------
  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);
  if (candles.length < 6) return { signal: null, state: prevState };

  const n = candles.length;

  // =========================
  // INDEXACIÓ PINE 1:1 (SENSE VELA EN FORMACIÓ)
  // =========================
  // Suposem que l’última vela de candles és la EN FORMACIÓ → NO la fem servir.
  // Pine:
  //   close     = close[0]  → última tancada
  //   close[1]  → penúltima
  //   close[2]  → antepenúltima
  //   close[3]  → quarta
  //
  // Map al bot:
  //   last  = candles[n-2] → close[0]
  //   c1    = candles[n-3] → close[1]
  //   c2    = candles[n-4] → close[2]
  //   c3    = candles[n-5] → close[3]

  const last = candles[n - 2];   // close[0] (última tancada)
  const c1   = candles[n - 3];   // close[1]
  const c2   = candles[n - 4];   // close[2]
  const c3   = candles[n - 5];   // close[3]

  // -------------------------
  // DEBUG
  // -------------------------
  if (debug) {
    console.log(`=== DEBUG ${symbol} ${timeframe} — Velas analizadas ===`);
    console.log("c3 (close[3]):", c3.timestamp, c3.open, c3.high, c3.low, c3.close);
    console.log("c2 (close[2]):", c2.timestamp, c2.open, c2.high, c2.low, c2.close);
    console.log("c1 (close[1]):", c1.timestamp, c1.open, c1.high, c1.low, c1.close);
    console.log("curr (close[0]):", last.timestamp, last.open, last.high, last.low, last.close);
    console.log("=========================================================");
  }

  // -------------------------
  // INDECISIÓ (PINE)
  // o1 = open[3], h1 = high[3], l1 = low[3], c1 = close[3]
  // o2 = open[2], c2 = close[2]
  // indecisió: abs(c2 - o2) < (h1 - l1) * 0.3
  // -------------------------
  const indecision = (mid, first) => {
    const r = first.high - first.low;
    if (r === 0) return true;
    return Math.abs(mid.close - mid.open) < r * 0.3;
  };

  // -------------------------
  // MS / ES (PINE)
  // o1,c1 → c3
  // o2,c2 → c2
  // o3,c3 → c1
  // -------------------------
  const msCond =
    isBear(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBull(c1.open, c1.close);

  const esCond =
    isBull(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBear(c1.open, c1.close);

  // -------------------------
  // TENDÈNCIA (PINE)
  // trendUp   = close > close[1] and close[1] >= close[2]
  // trendDown = close < close[1] and close[1] <= close[2]
  // -------------------------
  const trendUp =
    last.close > c1.close &&
    c1.close >= c2.close;

  const trendDown =
    last.close < c1.close &&
    c1.close <= c2.close;

  const trendNeutral = !trendUp && !trendDown;

  let msValid = msCond && (trendUp || trendNeutral);
  let esValid = esCond && (trendDown || trendNeutral);

  // -------------------------
  // MAGNITUD (PINE)
  // bodyFirst  = abs(c1 - o1) → c3
  // bodyThird  = abs(c3 - o3) → c1
  // magOK = bodyThird > bodyFirst * ratio
  //
  // Aquí no tenim ratio per símbol a config, així que mantenim el filtre
  // existent només si cfgmagnitude = true (com ja tenies).
  // -------------------------
  let msWeak = false;
  let esWeak = false;
  let msFiltered = msValid;
  let esFiltered = esValid;

  if (useMagnitudeFilter) {
    const bodyFirst = Math.abs(c3.close - c3.open);
    const bodyThird = Math.abs(c1.close - c1.open);
    const ratio = 0.6; // si vols 1:1 amb Pine, això hauria de venir de config_crypto
    const magOK = bodyThird > bodyFirst * ratio;

    msWeak = msValid && !magOK;
    esWeak = esValid && !magOK;

    msFiltered = msValid && magOK;
    esFiltered = esValid && magOK;
  } else {
    msFiltered = msValid;
    esFiltered = esValid;
  }

  // -------------------------
  // VOLATILITAT (PINE)
  // if useVolatilityFilter:
  //   volOK = atr(14) > sma(atr(14),20)
  //   msFiltered := msFiltered and volOK
  //   esFiltered := esFiltered and volOK
  // -------------------------
  const atrArr = calcATRArray(candles, 14);
  const atr14 = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  const atrSMA20 = sma(atrArr, 20);
  const volOK = atr14 && atrSMA20 ? atr14 > atrSMA20 : true;

  if (useVolatilityFilter) {
    msFiltered = msFiltered && volOK;
    esFiltered = esFiltered && volOK;
  }

  // -------------------------
  // EMA + DISTÀNCIA (PINE)
  // emaFast = ta.ema(close, emaLen)
  // distPctMS = abs((close - emaFast)/emaFast)*100
  // failsDistPct = distPctMS > distPctMax
  //
  // Aquí: si tens distPct a config_crypto, el pots aplicar.
  // De moment, mantenim el comportament antic (sense distPct),
  // perquè no el tenies implementat al bot.
  // -------------------------
  // (si vols, aquí després hi podem afegir distPct 1:1 amb Pine)

  // -------------------------
  // STATE
  // -------------------------
  const state = { ...prevState };

  if (state.prevMsFiltered === undefined) state.prevMsFiltered = false;
  if (state.prevEsFiltered === undefined) state.prevEsFiltered = false;

  // -------------------------
  // CLÚSTERS (PINE)
  // msCount = sma(msFiltered?1:0, window)*window
  // msCluster = msCount>=3 and msFiltered and not msFiltered[1]
  //
  // Al bot no tenim l’històric de msFiltered per cada vela,
  // així que aproximem recomputant condicions dins la finestra.
  // -------------------------
  const msFlags = [];
  const esFlags = [];

  // recomputem msFiltered/esFiltered per cada vela tancada dins la finestra
  for (let i = Math.max(5, n - window - 2); i <= n - 2; i++) {
    const last_i = candles[i];      // close[0] per aquesta posició
    const c1_i   = candles[i - 1];  // close[1]
    const c2_i   = candles[i - 2];  // close[2]
    const c3_i   = candles[i - 3];  // close[3]

    const msCond_i =
      isBear(c3_i.open, c3_i.close) &&
      indecision(c2_i, c3_i) &&
      isBull(c1_i.open, c1_i.close);

    const esCond_i =
      isBull(c3_i.open, c3_i.close) &&
      indecision(c2_i, c3_i) &&
      isBear(c1_i.open, c1_i.close);

    const trendUp_i =
      last_i.close > c1_i.close &&
      c1_i.close >= c2_i.close;

    const trendDown_i =
      last_i.close < c1_i.close &&
      c1_i.close <= c2_i.close;

    const trendNeutral_i = !trendUp_i && !trendDown_i;

    let msValid_i = msCond_i && (trendUp_i || trendNeutral_i);
    let esValid_i = esCond_i && (trendDown_i || trendNeutral_i);

    let msFiltered_i = msValid_i;
    let esFiltered_i = esValid_i;

    if (useMagnitudeFilter) {
      const bodyFirst_i = Math.abs(c3_i.close - c3_i.open);
      const bodyThird_i = Math.abs(c1_i.close - c1_i.open);
      const ratio_i = 0.6;
      const magOK_i = bodyThird_i > bodyFirst_i * ratio_i;
      msFiltered_i = msValid_i && magOK_i;
      esFiltered_i = esValid_i && magOK_i;
    }

    if (useVolatilityFilter && atr14 && atrSMA20) {
      const volOK_i = atr14 > atrSMA20;
      msFiltered_i = msFiltered_i && volOK_i;
      esFiltered_i = esFiltered_i && volOK_i;
    }

    msFlags.push(msFiltered_i ? 1 : 0);
    esFlags.push(esFiltered_i ? 1 : 0);
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

  // -------------------------
  // BUILD SIGNAL
  // -------------------------
  let signal = null;

  // IMPORTANT: al Pine, les etiquetes es pinten a bar_index[1]
  // → això correspon a c1 (close[1]) al nostre mapping.
  const signalTimestamp = c1.timestamp;
  const entryPrice = c1.close; // o c3.close si vols exactament com tenies abans

  if (msFiltered && !state.prevMsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "MS (UP)",
      timestamp: signalTimestamp,
      entry: entryPrice,
      reason: "ms",
      thirdCandle: c1
    };
  }

  if (esFiltered && !state.prevEsFiltered) {
    signal = {
      symbol,
      timeframe,
      type: "ES (DOWN)",
      timestamp: signalTimestamp,
      entry: entryPrice,
      reason: "es",
      thirdCandle: c1
    };
  }

  if (msCluster) {
    signal = {
      symbol,
      timeframe,
      type: "CLUSTER (UP)",
      timestamp: signalTimestamp,
      entry: entryPrice,
      reason: "cluster",
      thirdCandle: c1
    };
  }

  if (esCluster) {
    signal = {
      symbol,
      timeframe,
      type: "CLUSTER (DOWN)",
      timestamp: signalTimestamp,
      entry: entryPrice,
      reason: "cluster",
      thirdCandle: c1
    };
  }

  // -------------------------
  // UPDATE STATE
  // -------------------------
  state.prevMsFiltered = msFiltered;
  state.prevEsFiltered = esFiltered;

  return { signal, state };
}
