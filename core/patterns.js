// core/patterns.js — FIAT v1 1:1 TradingView

import { ema, sma } from "./ta.js";
import { isBull, isBear } from "./utils.js";
import { client } from "../db/client.js";

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

    const bodyFirst = Math.abs(c3.close - c3.open);
    const bodyThird = Math.abs(c1.close - c1.open);
    const magOK = bodyThird > bodyFirst * 0.6;
    const magSignal = magOK ? 1 : -1;

    const hSmooth = histSmooth[i];
    const hStdev = stdev(histSmooth.slice(0, i + 1), 20);

    const macdSignal =
      hSmooth > 0 ? 1 :
      hSmooth < 0 ? -1 : 0;

    const satSignal =
      hSmooth >  hStdev * 2.5 ?  1 :
      hSmooth < -hStdev * 2.5 ? -1 : 0;

    const tfMinutes = timeframe === "1H" ? 60 : 1440;
    const bars12h = Math.floor(12 * 60 / tfMinutes);

    let trendSignal = 0;

    if (i >= bars12h + 1) {
      const closesNowCalc = closes.slice(i - bars12h, i);
      const closesPastCalc = closes.slice(i - bars12h * 2, i - bars12h);

      const avgNowCalc = sma(closesNowCalc, bars12h);
      const avgPastCalc = sma(closesPastCalc, bars12h);

      const windowNowCalc = candles.slice(i - bars12h, i);
      const windowPastCalc = candles.slice(i - bars12h * 2, i - bars12h);

      const highNowCalc = Math.max(...windowNowCalc.map(c => c.high));
      const highPastCalc = Math.max(...windowPastCalc.map(c => c.high));

      const lowNowCalc = Math.min(...windowNowCalc.map(c => c.low));
      const lowPastCalc = Math.min(...windowPastCalc.map(c => c.low));

      const closeNowCalc = candles[i - 1].close;
      const closePastCalc = candles[i - bars12h - 1].close;

      let bullish = 0;
      let bearish = 0;

      if (closeNowCalc > closePastCalc) bullish++; else bearish++;
      if (avgNowCalc > avgPastCalc) bullish++; else bearish++;
      if (highNowCalc > highPastCalc) bullish++; else bearish++;
      if (lowNowCalc < lowPastCalc) bearish++;

      if (bullish >= 2) trendSignal = 1;
      else if (bearish >= 2) trendSignal = -1;
    }
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

    const msNew = msRaw && !prevMsRaw;
    const esNew = esRaw && !prevEsRaw;
    // -------------------------------------------------------------
    // FIAT — CÀLCUL DE DADES CONGELADES (ha d’anar abans de signals.push())
    // -------------------------------------------------------------
    let pastIndex, closesNow, closesPast, avgNow, avgPast,
        windowNow, windowPast, highNow, highPast,
        lowNow, lowPast, closeNow, closePast, targetTs;

    if (i >= bars12h + 1) {
      pastIndex = i - bars12h;
      targetTs = candles[i - bars12h].timestamp;

      closesNow = closes.slice(i - bars12h, i);
      closesPast = closes.slice(i - bars12h * 2, i - bars12h);

      avgNow = sma(closesNow, bars12h);
      avgPast = sma(closesPast, bars12h);

      windowNow = candles.slice(i - bars12h, i);
      windowPast = candles.slice(i - bars12h * 2, i - bars12h);

      highNow = Math.max(...windowNow.map(c => c.high));
      highPast = Math.max(...windowPast.map(c => c.high));

      lowNow = Math.min(...windowNow.map(c => c.low));
      lowPast = Math.min(...windowPast.map(c => c.low));

      closeNow = candles[i - 1].close;
      closePast = candles[i - bars12h - 1].close;
    }
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

        // 🔥 FIAT — punts
        magPts: scoreMs.magPts,
        macdPts: scoreMs.macdPts,
        trendPts: scoreMs.trendPts,
        satPts: scoreMs.satPts,

        // 🔥 FIAT — dades congelades
        closeNow,
        closePast,
        avgNow,
        avgPast,
        pastIndex,
        pastTs: pastIndex != null ? candles[pastIndex].timestamp : null,
        targetTs,
        trendSignal
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

        // 🔥 FIAT — punts
        magPts: scoreEs.magPts,
        macdPts: scoreEs.macdPts,
        trendPts: scoreEs.trendPts,
        satPts: scoreEs.satPts,

        // 🔥 FIAT — dades congelades
        closeNow,
        closePast,
        avgNow,
        avgPast,
        pastIndex,
        pastTs: pastIndex != null ? candles[pastIndex].timestamp : null,
        targetTs,
        trendSignal
      });
    }
    // -------------------------------------------------------------
    // INSERT FIAT — NOMÉS SI HI HA SENYAL
    // -------------------------------------------------------------
    if ((msNew || esNew) && i >= bars12h + 1) {
 
      let bullish = 0;
      let bearish = 0;

      if (closeNow > closePast) bullish++; else bearish++;
      if (avgNow > avgPast) bullish++; else bearish++;
      if (highNow > highPast) bullish++; else bearish++;
      if (lowNow < lowPast) bearish++;

      try {
        await client.query(
          `
          INSERT INTO debug_trend (
            symbol, timeframe,
            close_now, close_past,
            avg_now, avg_past,
            high_now, high_past,
            low_now, low_past,
            past_index, now_ts, target_ts, past_ts,
            bullish_count, bearish_count, trend_signal,
            updated_at
          )
          VALUES (
            $1, $2,
            $3, $4,
            $5, $6,
            $7, $8,
            $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17,
            NOW()
          )
          ON CONFLICT (symbol) DO UPDATE SET
            close_now = EXCLUDED.close_now,
            close_past = EXCLUDED.close_past,
            avg_now = EXCLUDED.avg_now,
            avg_past = EXCLUDED.avg_past,
            high_now = EXCLUDED.high_now,
            high_past = EXCLUDED.high_past,
            low_now = EXCLUDED.low_now,
            low_past = EXCLUDED.low_past,
            past_index = EXCLUDED.past_index,
            now_ts = EXCLUDED.now_ts,
            target_ts = EXCLUDED.target_ts,
            past_ts = EXCLUDED.past_ts,
            bullish_count = EXCLUDED.bullish_count,
            bearish_count = EXCLUDED.bearish_count,
            trend_signal = EXCLUDED.trend_signal,
            updated_at = NOW()
          `,
          [
            symbol,
            timeframe,
            closeNow,
            closePast,
            avgNow,
            avgPast,
            highNow,
            highPast,
            lowNow,
            lowPast,
            pastIndex,
            nowTs,
            targetTs,
            candles[pastIndex].timestamp,
            bullish,
            bearish,
            trendSignal
          ]
        );
      } catch (err) {
        console.log("[DEBUG_TREND ERROR]", err.message);
      }
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

  if (isMs && rawScore < 0) {
    rawScore = -Math.abs(rawScore);
  }
  if (!isMs && rawScore < 0) {
    rawScore = -Math.abs(rawScore);
  }

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

// -------------------------------------------------------------
// STDEV helper (equivalent a ta.stdev(histSmooth, 20))
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
