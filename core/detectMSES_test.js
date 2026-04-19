// core/detectMSES_test.js
// Versió per OP-USDT, 1:1 amb la lògica de senyals i clúster tipus TradingView

// Helpers
function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }
function body(o, c) { return Math.abs(c - o); }
function range(h, l) { return h - l; }

export async function detectMSES_test(candlesRaw, symbol, timeframe, prevState = {}) {

  // CONFIG OP-USDT
  const window = 14;

  if (!candlesRaw || candlesRaw.length < 5)
    return { signal: null, state: prevState };

  let candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);

  const n = candles.length;

  // Índexs estil Pine
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

  // MS (UP): c3 bearish → c2 indecisive → c1 bullish
  const msCond =
    isBear(c3.open, c3.close) &&
    indecision(c2.open, c3.high, c3.low, c2.close) &&
    isBull(c1.open, c1.close);

  // ES (DOWN): c3 bullish → c2 indecisive → c1 bearish
  const esCond =
    isBull(c3.open, c3.close) &&
    indecision(c2.open, c3.high, c3.low, c2.close) &&
    isBear(c1.open, c1.close);

  // Trend (suau, estil TV)
  const trendUp =
    curr.close > c1.close &&
    c1.close >= c2.close;

  const trendDown =
    curr.close < c1.close &&
    c1.close <= c2.close;

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

  // Clúster estil TradingView:
  //  - 3 o més senyals dins finestra
  //  - la vela actual també és senyal
  //  - opcionalment, que no hi hagi senyal contrari a la mateixa vela
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
