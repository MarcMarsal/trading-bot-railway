// core/patterns.js — FIAT v1 1:1 TradingView

import { ema, sma } from "./ta.js";
import { isBull, isBear } from "./utils.js";

// -------------------------------------------------------------
// DETECT MSES FIAT v1 (1:1 TradingView)
// -------------------------------------------------------------
export async function detectMSES(candlesRaw, symbol, timeframe) {
  if (!candlesRaw || candlesRaw.length < 40)
    return { signals: [] };

  const candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

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

  for (let i = 4; i < n; i++) {

    const c0 = candles[i];
    const c1 = candles[i - 1];
    const c2 = candles[i - 2];
    const c3 = candles[i - 3];

    // -----------------------------
    // MS / ES RAW
    // -----------------------------
    const rangeFirst = c3.high - c3.low;
    const indecisionOK =
      rangeFirst === 0
        ? true
        : Math.abs(c2.close - c2.open) <= rangeFirst * 0.3;

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

    const macdSignal =
      hSmooth > 0 ? 1 :
      hSmooth < 0 ? -1 : 0;

    const satSignal =
      hSmooth >  hStdev * 2.5 ?  1 :
      hSmooth < -hStdev * 2.5 ? -1 : 0;

// -----------------------------
// TENDÈNCIA 12 HORES — FIAT TRANSPORTABLE (LIMITAT COM PINE)
// -----------------------------
const tfMinutes = timeframe === "1H" ? 60 : 1440;
const bars12h = Math.floor(12 * 60 / tfMinutes);

let trendSignal = 0;

if (i >= 1) {
  const closeNow = candles[i - 1].close;
  const nowTs = candles[i - 1].timestamp;
  const targetTs = nowTs - 12 * 60 * 60 * 1000;

  // 🔹 Limitem la cerca a 2 * bars12h barres enrere (com Pine)
  const limit = Math.min(i, bars12h * 2);
  let pastIndex = 0;
  let bestDiff = Infinity;

  for (let k = 0; k < limit; k++) {
    const diff = Math.abs(candles[k].timestamp - targetTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      pastIndex = k;
    }
  }

  const closePast = candles[pastIndex].close;

  // Finestra per avgNow: últimes 12 hores
  const avgNowStart = Math.max(0, i - bars12h);
  const avgNow = sma(closes.slice(avgNowStart, i), i - avgNowStart);

  // Finestra per avgPast: 12 hores abans de pastIndex
  const avgPastStart = Math.max(0, pastIndex - bars12h);
  const avgPast = sma(closes.slice(avgPastStart, pastIndex), pastIndex - avgPastStart);

  const trendUp12h = closeNow > closePast && avgNow > avgPast;
  const trendDown12h = closeNow < closePast && avgNow < avgPast;

  trendSignal = trendUp12h ? 1 : trendDown12h ? -1 : 0;
}





    // -----------------------------
    // FIAT SCORING 0–10 (1:1 Pine)
    // -----------------------------
    const scoreMs = scoreFiatRouter(
      true,
      magSignal,
      macdSignal,
      trendSignal,
      satSignal,
      symbol
    );

    const scoreEs = scoreFiatRouter(
      false,
      magSignal,
      macdSignal,
      trendSignal,
      satSignal,
      symbol
    );

    // -----------------------------
    // NOVA SENYAL
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
        score: scoreMs.score,
        isGood: scoreMs.isGood,

        // 🔥 AFEGIT FIAT (sense tocar res més)
        mag_pts: scoreMs.magPts,
        macd_pts: scoreMs.macdPts,
        trend_pts: scoreMs.trendPts,
        sat_pts: scoreMs.satPts
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
        score: scoreEs.score,
        isGood: scoreEs.isGood,

        // 🔥 AFEGIT FIAT (sense tocar res més)
        mag_pts: scoreEs.magPts,
        macd_pts: scoreEs.macdPts,
        trend_pts: scoreEs.trendPts,
        sat_pts: scoreEs.satPts
      });
    }

    prevMsRaw = msRaw;
    prevEsRaw = esRaw;
  }

  return { signals };
}

// -------------------------------------------------------------
// FIAT SCORING 0–10 (1:1 Pine Script)
// -------------------------------------------------------------

const CRYPTO_LIST = [
  "BTC-USDT","SUI-USDT","SOL-USDT","XRP-USDT","AVAX-USDT",
  "APT-USDT","INJ-USDT","SEI-USDT","ADA-USDT","LINK-USDT",
  "BNB-USDT","ETH-USDT","NEAR-USDT","HBAR-USDT","RENDER-USDT",
  "ASTER-USDT","BCH-USDT","VIRTUAL-USDT","ATOM-USDT",
  "OP-USDT","ARB-USDT","DOT-USDT"
];

const MAG_EXP_ARR   = [2,1,2,1,2, 1,2,1,1,2, 1,2,2,1,2, 1,1,1,2, 1,1,1];
const MACD_EXP_ARR  = [2,2,2,1,2, 2,2,2,1,2, 1,2,2,1,2, 1,2,1,2, 2,2,1];
const TREND_EXP_ARR = [2,2,3,1,3, 2,3,2,1,3, 2,2,2,2,2, 2,2,2,2, 2,2,2];

const MAG_WEIGHT_ARR = [
  1,0,1,0,1,
  1,1,0,0,1,
  1,1,0,0,1,
  0,1,0,1,1,
  0,0
];

const MACD_WEIGHT_ARR = [
  1,1,1,1,1,
  1,1,1,1,1,
  1,1,1,1,1,
  1,1,1,1,1,
  1,1
];

const TREND_WEIGHT_ARR = [
  2,3,2,3,2,
  2,2,3,3,2,
  2,2,4,3,2,
  4,2,4,2,2,
  3,3
];

function getIdx(symbol) {
  return CRYPTO_LIST.indexOf(symbol);
}

function scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol) {
  const idx = getIdx(symbol);
  const safeIdx = idx === -1 ? 0 : idx;

  const magExp   = MAG_EXP_ARR[safeIdx];
  const macdExp  = MACD_EXP_ARR[safeIdx];
  const trendExp = TREND_EXP_ARR[safeIdx];

  const magW   = MAG_WEIGHT_ARR[safeIdx];
  const macdW  = MACD_WEIGHT_ARR[safeIdx];
  const trendW = TREND_WEIGHT_ARR[safeIdx];

  const magPts =
    magSignal === 1 ? magExp * magW : 0;

  const macdPts =
    macdSignal === 1 ? macdExp * macdW : 0;

  const trendBase =
    trendSignal === 1 ?  trendExp * trendW :
    trendSignal === -1 ? -trendExp * trendW : 0;

  const trendPts = isMs ? trendBase : -trendBase;

  const satPts = satSignal === 1 ? 1 : 0;

  let rawScore = magPts + macdPts + trendPts + satPts;

  if (macdPts > 0 && trendPts > 0) rawScore += 1;
  if (macdPts > 0 && satPts > 0)   rawScore += 1;

  if (isMs && rawScore < 0) rawScore = -Math.abs(rawScore);
  if (!isMs && rawScore < 0) rawScore = -Math.abs(rawScore);

  const score  = rawScore;
  const isGood = rawScore >= 1;

  return { score, isGood, magPts, macdPts, trendPts, satPts };
}

function scoreFiatRouter(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol) {
  const sym = symbol.replace("-", "");

  if (sym === "SOLUSDT" || sym === "LINKUSDT") {
    return scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol);
  } else if (sym === "BTCUSDT") {
    return scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol);
  } else {
    return scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol);
  }
}

function stdev(arr, period) {
  if (!arr || arr.length < period) return 0;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;

  const variance =
    slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    (period - 1);

  return Math.sqrt(variance);
}
