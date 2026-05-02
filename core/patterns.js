// core/patterns.js — FIAT v1 PUR (1:1 TradingView)

import { ema, sma, calcATRArray } from "./ta.js";   // Assumim helpers separats
import { isBull, isBear, body } from "./utils.js";  // Helpers simples

// -------------------------------------------------------------
// DETECT MSES FIAT v1 (1:1 TradingView)
// -------------------------------------------------------------
export async function detectMSES(candlesRaw, symbol, timeframe) {
  if (!candlesRaw || candlesRaw.length < 40)
    return { signals: [] };

  // Ordenar veles
  const candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

  // Precalcular arrays
  const closes = candles.map(c => c.close);

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  const histSmooth = ema(hist, 5);

  const signals = [];

  let prevMsRaw = false;
  let prevEsRaw = false;

  // Loop FIAT-clean (igual que TradingView)
  for (let i = 4; i < n; i++) {

    const c0 = candles[i];     // vela actual (no usada per patró)
    const c1 = candles[i - 1]; // 3a vela del patró
    const c2 = candles[i - 2];
    const c3 = candles[i - 3];

    // -----------------------------
    // MS / ES RAW (1:1 TradingView)
    // -----------------------------
    const rangeFirst = c3.high - c3.low;
    const indecisionOK =
      rangeFirst === 0
        ? true
        : Math.abs(c2.close - c2.open) < rangeFirst * 0.3;

    const msRaw =
      isBear(c3.open, c3.close) &&
      indecisionOK &&
      isBull(c1.open, c1.close);

    const esRaw =
      isBull(c3.open, c3.close) &&
      indecisionOK &&
      isBear(c1.open, c1.close);

    // -----------------------------
    // MAGNITUD FIAT
    // -----------------------------
    const bodyFirst = Math.abs(c3.close - c3.open);
    const bodyThird = Math.abs(c1.close - c1.open);
    const magOK = bodyThird > bodyFirst * 0.6;
    const magSignal = magOK ? 1 : -1;

    // -----------------------------
    // MACD FIAT + SATURACIÓ
    // -----------------------------
    const hSmooth = histSmooth[i];
    const hStdev = stdev(histSmooth.slice(0, i + 1), 20);

    const macdSignal = hSmooth > 0 ? 1 : hSmooth < 0 ? -1 : 0;
    const satSignal =
      hSmooth > hStdev * 2.5 ? 1 :
      hSmooth < -hStdev * 2.5 ? -1 : 0;

    // -----------------------------
    // TENDÈNCIA 12 HORES
    // -----------------------------
    const tfMinutes = timeframe === "1H" ? 60 : 1440;
    const bars12h = Math.floor(12 * 60 / tfMinutes);

    const enough = i > bars12h + 5;

    const closeNow = c0.close;
    const closePast = enough ? candles[i - bars12h].close : closeNow;

    const avgNow = sma(closes.slice(i - bars12h + 1, i + 1), bars12h);
    const avgPast = enough
      ? sma(closes.slice(i - bars12h * 2 + 1, i - bars12h + 1), bars12h)
      : avgNow;

    const highNow = Math.max(...candles.slice(i - bars12h + 1, i + 1).map(c => c.high));
    const highPast = enough
      ? Math.max(...candles.slice(i - bars12h * 2 + 1, i - bars12h + 1).map(c => c.high))
      : highNow;

    const lowNow = Math.min(...candles.slice(i - bars12h + 1, i + 1).map(c => c.low));
    const lowPast = enough
      ? Math.min(...candles.slice(i - bars12h * 2 + 1, i - bars12h + 1).map(c => c.low))
      : lowNow;

    const trendUp12h =
      closeNow > closePast &&
      avgNow > avgPast &&
      highNow > highPast;

    const trendDown12h =
      closeNow < closePast &&
      avgNow < avgPast &&
      lowNow < lowPast;

    const trendSignal = trendUp12h ? 1 : trendDown12h ? -1 : 0;

    // -----------------------------
    // FIAT SCORING (amb weights)
    // -----------------------------
    const { magExp, macdExp, trendExp, magW, macdW, trendW } =
      getExposuresAndWeights(symbol);

    const magPts = magSignal === 1 ? magExp * magW : 0;
    const macdPts = macdSignal === 1 ? macdExp * macdW : 0;
    const trendPts = trendSignal === 1 ? trendExp * trendW : 0;
    const satPts = satSignal === 1 ? 1 : 0;

    let score = magPts + macdPts + trendPts + satPts;

    if (macdPts > 0 && trendPts > 0) score += 1;
    if (macdPts > 0 && satPts > 0) score += 1;

    const isGood = score >= 1;

    // -----------------------------
    // NOVA SENYAL (1:1 TradingView)
    // -----------------------------
    const msNew = msRaw && !prevMsRaw;
    const esNew = esRaw && !prevEsRaw;

    if (msNew) {
      signals.push({
        symbol,
        timeframe,
        type: "M",
        timestamp: c1.timestamp,
        entry: c1.close,
        thirdCandle: c1,
        score,
        isGood
      });
    }

    if (esNew) {
      signals.push({
        symbol,
        timeframe,
        type: "E",
        timestamp: c1.timestamp,
        entry: c1.close,
        thirdCandle: c1,
        score,
        isGood
      });
    }

    prevMsRaw = msRaw;
    prevEsRaw = esRaw;
  }

  return { signals };
}

function getExposuresAndWeights(symbol) {
  const list = [
    "BTC-USDT","SUI-USDT","SOL-USDT","XRP-USDT","AVAX-USDT",
    "APT-USDT","INJ-USDT","SEI-USDT","ADA-USDT","LINK-USDT",
    "BNB-USDT","ETH-USDT","NEAR-USDT","HBAR-USDT","RENDER-USDT",
    "ASTER-USDT","BCH-USDT","VIRTUAL-USDT","ATOM-USDT",
    "OP-USDT","ARB-USDT","DOT-USDT"
  ];

  const magExpArr   = [2,1,2,1,2, 1,2,1,1,2, 1,2,2,1,2, 1,1,1,2, 1,1,1];
  const macdExpArr  = [2,2,2,1,2, 2,2,2,1,2, 1,2,2,1,2, 1,2,1,2, 2,2,1];
  const trendExpArr = [2,2,3,1,3, 2,3,2,1,3, 2,2,2,2,2, 2,2,2,2, 2,2,2];

  const magWeightArr   = [1,0,1,0,1,1,1,0,0,1,1,1,0,0,1,0,1,0,1,1,0,0];
  const macdWeightArr  = [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
  const trendWeightArr = [2,3,2,3,2,2,2,3,3,2,2,2,4,3,2,4,2,4,2,2,3,3];

  const idx = list.indexOf(symbol);
  if (idx === -1) {
    return {
      magExp: 1, macdExp: 1, trendExp: 1,
      magW: 1, macdW: 1, trendW: 1
    };
  }

  return {
    magExp:  magExpArr[idx],
    macdExp: macdExpArr[idx],
    trendExp: trendExpArr[idx],
    magW:    magWeightArr[idx],
    macdW:   macdWeightArr[idx],
    trendW:  trendWeightArr[idx]
  };
}



// -------------------------------------------------------------
// UTILITATS FIAT (exposicions per cripto)
// -------------------------------------------------------------
function getExposures(symbol) {
  const list = [
    "BTC-USDT","SUI-USDT","SOL-USDT","XRP-USDT","AVAX-USDT",
    "APT-USDT","INJ-USDT","SEI-USDT","ADA-USDT","LINK-USDT",
    "BNB-USDT","ETH-USDT","NEAR-USDT","HBAR-USDT","RENDER-USDT",
    "ASTER-USDT","BCH-USDT","VIRTUAL-USDT","ATOM-USDT",
    "OP-USDT","ARB-USDT","DOT-USDT"
  ];

  const magExpArr   = [2,1,2,1,2,1,2,1,1,2,1,2,2,1,2,1,1,1,2,1,1,1];
  const macdExpArr  = [2,2,2,1,2,2,2,2,1,2,1,2,2,1,2,1,2,1,2,2,2,1];
  const trendExpArr = [2,2,3,1,3,2,3,2,1,3,2,2,2,2,2,2,2,2,2,2,2,2];

  const idx = list.indexOf(symbol);
  if (idx === -1) return { magExp: 1, macdExp: 1, trendExp: 1 };

  return {
    magExp: magExpArr[idx],
    macdExp: macdExpArr[idx],
    trendExp: trendExpArr[idx]
  };
}

// -------------------------------------------------------------
// STDEV helper
// -------------------------------------------------------------
function stdev(arr, period) {
  if (!arr || arr.length < period) return 0;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  return Math.sqrt(variance);
}
