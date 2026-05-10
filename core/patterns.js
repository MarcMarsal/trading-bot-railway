// core/patterns.js — FIAT v1 1:1 TradingView

import { ema, sma } from "./ta.js";
import { isBull, isBear } from "./utils.js";

// -------------------------------------------------------------
// DETECT MSES FIAT v1 (1:1 TradingView)
// -------------------------------------------------------------
export async function detectMSES(candlesRaw, symbol, timeframe) {
  if (!candlesRaw || candlesRaw.length < 40)
    return { signals: [] };

  // Ordenar veles de més antiga a més nova
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
  // IMPORTANT: només veles tancades, mai intravela
  for (let i = 4; i < n; i++) {

    const c0 = candles[i];     // vela actual (no usada per patró MS/ES)
    const c1 = candles[i - 1]; // 3a vela del patró (entry)
    const c2 = candles[i - 2];
    const c3 = candles[i - 3];

    // -----------------------------
    // MS / ES RAW (1:1 TradingView)
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
    // TENDÈNCIA 12 HORES (1:1 Pine)
// -----------------------------
    const tfMinutes = timeframe === "1H" ? 60 : 1440;
    const bars12h = Math.floor(12 * 60 / tfMinutes);

    const enough = i > bars12h;

    const closeNow = c0.close;
    const closePast = enough ? candles[i - bars12h].close : closeNow;

    const avgNow = sma(closes.slice(i - bars12h + 1, i + 1), bars12h);
    const avgPast = enough
      ? sma(closes.slice(i - bars12h * 2 + 1, i - bars12h + 1), bars12h)
      : avgNow;

    const highNow = Math.max(
      ...candles.slice(i - bars12h + 1, i + 1).map(c => c.high)
    );
    const highPast = enough
      ? Math.max(
          ...candles
            .slice(i - bars12h * 2 + 1, i - bars12h + 1)
            .map(c => c.high)
        )
      : highNow;

    const lowNow = Math.min(
      ...candles.slice(i - bars12h + 1, i + 1).map(c => c.low)
    );
    const lowPast = enough
      ? Math.min(
          ...candles
            .slice(i - bars12h * 2 + 1, i - bars12h + 1)
            .map(c => c.low)
        )
      : lowNow;

    const trendUp12h =
      closeNow > closePast &&
      avgNow > avgPast &&
      highNow > highPast;

    const trendDown12h =
      closeNow < closePast &&
      avgNow < avgPast &&
      lowNow < lowPast;

    const trendSignal =
      trendUp12h ? 1 :
      trendDown12h ? -1 : 0;

    // -----------------------------
    // FIAT SCORING 0–10 (1:1 Pine)
    // -----------------------------
    // Calculem score per MS i per ES per separat,
    // igual que fa TradingView amb f_scoreFiat_router(true/false,...)
    const scoreMs = scoreFiatRouter(
      true,          // isMs
      magSignal,
      macdSignal,
      trendSignal,
      satSignal,
      symbol
    );

    const scoreEs = scoreFiatRouter(
      false,         // isMs
      magSignal,
      macdSignal,
      trendSignal,
      satSignal,
      symbol
    );

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
        timestamp: c1.timestamp,   // sempre ms, vela tancada
        entry: c1.close,
        thirdCandle: c1,
        score: scoreMs.score,
        isGood: scoreMs.isGood
      });
    }

    if (esNew) {
      signals.push({
        symbol,
        timeframe,
        type: "E",
        timestamp: c1.timestamp,   // sempre ms, vela tancada
        entry: c1.close,
        thirdCandle: c1,
        score: scoreEs.score,
        isGood: scoreEs.isGood
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

  const score  = rawScore;
  const isGood = rawScore >= 1;

  return { score, isGood, magPts, macdPts, trendPts, satPts };
}

// Router FIAT per cripto (igual que Pine, preparat per SOL/LINK/BTC)
function scoreFiatRouter(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol) {
  const sym = symbol.replace("-", ""); // només per routing intern

  // Ara mateix SOL/LINK/BTC usen la mateixa lògica base,
  // però deixem el router preparat per optimitzar BTC/LINK més endavant.
  if (sym === "SOLUSDT" || sym === "LINKUSDT") {
    return scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol);
  } else if (sym === "BTCUSDT") {
    return scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol);
  } else {
    return scoreFiatBase(isMs, magSignal, macdSignal, trendSignal, satSignal, symbol);
  }
}

// -------------------------------------------------------------
// STDEV helper (equivalent a ta.stdev(histSmooth, 20))
// -------------------------------------------------------------
function stdev(arr, period) {
  if (!arr || arr.length < period) return 0;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;

  const variance =
    slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    (period - 1); // <-- clau: mostral, com ta.stdev

  return Math.sqrt(variance);
}

