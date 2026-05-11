// core/patterns.js — FIAT v1 1:1 TradingView

import { ema, sma } from "./ta.js";
import { isBull, isBear } from "./utils.js";

function stdev(arr, period) {
  if (!arr || arr.length < period) return 0;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;

  const variance =
    slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    (period - 1);

  return Math.sqrt(variance);
}


// -------------------------------------------------------------
// DETECT MSES FIAT v1 (1:1 TradingView)
// -------------------------------------------------------------
export async function detectMSES(candlesRaw, symbol, timeframe) {
  if (!candlesRaw || candlesRaw.length < 40)
    return { signals: [], trendDebug: null };

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

  // 🔥 FIAT: afegim contenidor per trendDebug
  let lastTrendDebug = null;

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
    // TENDÈNCIA 12 HORES — FIAT TRANSPORTABLE
    // -----------------------------
    const tfMinutes = timeframe === "1H" ? 60 : 1440;
    const bars12h = Math.floor(12 * 60 / tfMinutes);

    let trendSignal = 0;

    if (i >= 1) {
      const closeNow = candles[i - 1].close;
      const nowTs = candles[i - 1].timestamp;
      const targetTs = nowTs - 12 * 60 * 60 * 1000;

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

      const avgNowStart = Math.max(0, i - bars12h);
      const avgNow = sma(closes.slice(avgNowStart, i), i - avgNowStart);

      const avgPastStart = Math.max(0, pastIndex - bars12h);
      const avgPast = sma(closes.slice(avgPastStart, pastIndex), pastIndex - avgPastStart);

      const trendUp12h = closeNow > closePast && avgNow > avgPast;
      const trendDown12h = closeNow < closePast && avgNow < avgPast;

      trendSignal = trendUp12h ? 1 : trendDown12h ? -1 : 0;

      // 🔥 FIAT: trendDebug per guardar a la taula
      lastTrendDebug = {
        closeNow,
        closePast,
        avgNow,
        avgPast,
        pastIndex,
        nowTs,
        targetTs,
        pastTs: candles[pastIndex].timestamp
      };
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
        mag_pts: scoreEs.magPts,
        macd_pts: scoreEs.macdPts,
        trend_pts: scoreEs.trendPts,
        sat_pts: scoreEs.satPts
      });
    }

    prevMsRaw = msRaw;
    prevEsRaw = esRaw;
  }

  // 🔥 FIAT: retornem trendDebug perquè el bot el pugui inserir
  return { signals, trendDebug: lastTrendDebug };
}
