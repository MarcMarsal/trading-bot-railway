// core/patterns.js — FIAT v1 1:1 TradingView (PUR, sense guardar a BD)

import { ema, sma } from "./ta.js";
import { isBull, isBear } from "./utils.js";

// Helper d'arrodoniment FIAT (4 decimals)
function r4(x) {
  return Math.round(x * 10000) / 10000;
}

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
    const bodyFirst = Math.abs(r4(c3.close) - r4(c3.open));
    const bodyThird = Math.abs(r4(c1.close) - r4(c1.open));
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

    // -------------------------------------------------------------
    // TENDÈNCIA 12 HORES
    // -------------------------------------------------------------
    const tfMinutes = timeframe === "1H" ? 60 : 1440;
    const bars12h = Math.floor(12 * 60 / tfMinutes);

    let trendSignal = 0;

    if (i >= bars12h * 2) {

      const closesNow = closes.slice(i - bars12h, i);
      const closesPast = closes.slice(i - bars12h * 2, i - bars12h);

      const avgNow = sma(closesNow, bars12h);
      const avgPast = sma(closesPast, bars12h);

      const windowNow = candles.slice(i - bars12h, i);
      const windowPast = candles.slice(i - bars12h * 2, i - bars12h);

      const highNow = Math.max(...windowNow.map(c => c.high));
      const highPast = Math.max(...windowPast.map(c => c.high));

      const lowNow = Math.min(...windowNow.map(c => c.low));
      const lowPast = Math.min(...windowPast.map(c => c.low));

      const closeNow = candles[i - 1].close;
      const closePast = candles[i - bars12h - 1].close;

      let bullish = 0;
      let bearish = 0;

      if (closeNow > closePast) bullish++; else bearish++;
      if (avgNow > avgPast) bullish++; else bearish++;
      if (highNow > highPast) bullish++; else bearish++;

      if (lowNow < lowPast) bearish++;

      if (bullish >= 2) trendSignal = 1;
      else if (bearish >= 2) trendSignal = -1;
      else trendSignal = 0;
    }

    // -----------------------------
    // FIAT SCORING 0–10
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

    // -----------------------------
    // RETORNAR MS
    // -----------------------------
    if (msNew) {
      const S = scoreMs;

      signals.push({
        symbol,
        timeframe,
        type: "M",
        timestamp: c1.timestamp,
        entry: c1.close,
        score: S.score,
        isGood: S.isGood,
        mag_pts: S.magPts,
        macd_pts: S.macdPts,
        trend_pts: S.trendPts,
        sat_pts: S.satPts
      });
    }

    // -----------------------------
    // RETORNAR ES
    // -----------------------------
    if (esNew) {
      const S = scoreEs;

      signals.push({
        symbol,
        timeframe,
        type: "E",
        timestamp: c1.timestamp,
        entry: c1.close,
        score: S.score,
        isGood: S.isGood,
        mag_pts: S.magPts,
        macd_pts: S.macdPts,
        trend_pts: S.trendPts,
        sat_pts: S.satPts
      });
    }

    prevMsRaw = msRaw;
    prevEsRaw = esRaw;
  }

  return { signals };
}

// -------------------------------------------------------------
// FIAT SCORING 0–10
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

  return {
    score: rawScore,
    isGood: rawScore >= 1,
    magPts,
    macdPts,
    trendPts,
    satPts
  };
}

function scoreFiatRouter(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol) {
  return scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol);
}

// -------------------------------------------------------------
// STDEV helper
// -------------------------------------------------------------
function stdev(arr, period) {
  if (!arr || arr.length < period) return 0;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;

  const variance =
    slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    (period - 1);

  return Math.sqrt(variance);
}
