// core/patterns.js — FIAT 2.0 1:1 TradingView

import { ema, sma } from "./ta.js";
import { isBull, isBear } from "./utils.js";
import { client } from "../db/client.js";

function ema_TV(values, length) {
  const alpha = 2 / (length + 1);
  const ema = new Array(values.length);

  // Seed EXACTE com TradingView: primer valor = primer close
  ema[0] = values[0];

  for (let i = 1; i < values.length; i++) {
    ema[i] = ema[i - 1] + alpha * (values[i] - ema[i - 1]);
  }

  return ema;
}

// -------------------------------------------------------------
// DETECT MSES FIAT 2.0 (1:1 TradingView)
// -------------------------------------------------------------
export async function detectMSES(candlesRaw, symbol, timeframe) {
  if (!candlesRaw || candlesRaw.length < 40)
    return { signals: [] };

  const candles = [...candlesRaw].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

  const closes = candles.map(c => c.close);

  //const ema12 = ema(closes, 12);
  //const ema26 = ema(closes, 26);
  //const macdLine = ema12.map((v, i) => v - ema26[i]);
  //const signalLine = ema(macdLine, 9);
  //const hist = macdLine.map((v, i) => v - signalLine[i]);
  //const histSmooth = ema(hist, 5);

  const ema12 = ema_TV(closes, 12);
  const ema26 = ema_TV(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema_TV(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  const histSmooth = ema_TV(hist, 5);

  
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

    const hSmooth = histSmooth[i-1];
    const hStdev = stdev(histSmooth.slice(0, i + 1), 20);

    const macdSignal =
      hSmooth > 0 ? 1 :
      hSmooth < 0 ? -1 : 0;

    const satSignal =
      hSmooth >  hStdev * 2.5 ?  1 :
      hSmooth < -hStdev * 2.5 ? -1 : 0;

    // -----------------------------------------------------------
    // TENDÈNCIA 12H FIAT — 1:1 TradingView
    // -----------------------------------------------------------
    const tfMinutes = timeframe === "1H" ? 60 : 1440;
    const bars12h = Math.floor((12 * 60) / tfMinutes);

    const realIndex = i;

    const nowTs = candles[realIndex].timestamp;
    const targetTs = nowTs - 12 * 60 * 60 * 1000;

    let bestDiff = Number.MAX_SAFE_INTEGER;
    let pastIndexBarsAgo = null;

    const maxLookback = Math.min(realIndex, bars12h * 2);

    for (let k = 0; k <= maxLookback; k++) {
      const idx = realIndex - k;
      if (idx < 0) break;

      const ts = candles[idx].timestamp;
      const diff = Math.abs(ts - targetTs);

      if (diff < bestDiff) {
        bestDiff = diff;
        pastIndexBarsAgo = k;
      }
    }

    let closeNow = candles[realIndex].close;
    let closePast = closeNow;
    let avgNow = null;
    let avgPast = null;

    if (pastIndexBarsAgo === null || realIndex < bars12h) {
      avgNow = sma(closes.slice(realIndex - bars12h + 1, realIndex + 1), bars12h);
      avgPast = avgNow;
    } else {
      const idxPast = realIndex - pastIndexBarsAgo;

      closePast = candles[idxPast].close;

      const closesNowWin = closes.slice(realIndex - bars12h + 1, realIndex + 1);
      avgNow = sma(closesNowWin, bars12h);

      const startPast = idxPast - bars12h + 1;

      if (startPast >= 0) {
        const closesPastWin = closes.slice(startPast, idxPast + 1);
        avgPast = sma(closesPastWin, bars12h);
      } else {
        avgPast = avgNow;
      }
    }

    const trendUp12h = closeNow > closePast && avgNow > avgPast;
    const trendDown12h = closeNow < closePast && avgNow < avgPast;

    let trendSignal = 0;
    trendSignal = trendUp12h ? 1 : trendDown12h ? -1 : 0;

    // -----------------------------------------------------------
    // FIAT 2.0 — puntuació MS / ES
    // -----------------------------------------------------------
    const scoreMs = applyFiat2Score(
      magSignal === 1 ? 1 : 0,
      macdSignal === 1 ? 1 : 0,   // MACD alcista per MS
      trendSignal === 1 ? 1 : 0,
      satSignal === 1 ? 1 : 0,
      symbol
    );

    const scoreEs = applyFiat2Score(
      magSignal === 1 ? 1 : 0,
      macdSignal === -1 ? 1 : 0,  // MACD baixista per ES
      trendSignal === -1 ? 1 : 0,
      satSignal === -1 ? 1 : 0,
      symbol
    );

    const msNew = msRaw && !prevMsRaw;
    const esNew = esRaw && !prevEsRaw;

    // -----------------------------------------------------------
    // FIAT — DADES CONGELADES (1:1 TradingView)
    // -----------------------------------------------------------
    let pastIndex = null;

    let closeNowFreeze = closeNow;
    let closePastFreeze = closePast;
    let avgNowFreeze = avgNow;
    let avgPastFreeze = avgPast;
    let targetTsFreeze = targetTs;

    if (pastIndexBarsAgo != null) {
      pastIndex = realIndex - pastIndexBarsAgo;

      if (pastIndex >= 0 && pastIndex - bars12h + 1 >= 0) {
        const closesPastWin = closes.slice(pastIndex - bars12h + 1, pastIndex + 1);
        avgPastFreeze = sma(closesPastWin, bars12h);
      }
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

        magPts: scoreMs.magPts,
        macdPts: scoreMs.macdPts,
        trendPts: scoreMs.trendPts,
        satPts: scoreMs.satPts,

        closeNow: closeNowFreeze,
        closePast: closePastFreeze,
        avgNow: avgNowFreeze,
        avgPast: avgPastFreeze,
        pastIndex,
        pastTs: pastIndex != null ? candles[pastIndex].timestamp : null,
        targetTs: targetTsFreeze,
        trendSignal,
        // 🟩 AFEGIT FIAT‑NET
        c1_open: c1.open,
        c1_close: c1.close,
        c2_open: c2.open,
        c2_close: c2.close,
        c3_open: c3.open,
        c3_close: c3.close
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

        magPts: scoreEs.magPts,
        macdPts: scoreEs.macdPts,
        trendPts: scoreEs.trendPts,
        satPts: scoreEs.satPts,

        closeNow: closeNowFreeze,
        closePast: closePastFreeze,
        avgNow: avgNowFreeze,
        avgPast: avgPastFreeze,
        pastIndex,
        pastTs: pastIndex != null ? candles[pastIndex].timestamp : null,
        targetTs: targetTsFreeze,
        trendSignal,
        // 🟩 AFEGIT FIAT‑NET
        c1_open: c1.open,
        c1_close: c1.close,
        c2_open: c2.open,
        c2_close: c2.close,
        c3_open: c3.open,
        c3_close: c3.close
      });
    }

    if ((msNew || esNew) && i >= bars12h + 1) {
      const nowTs2 = candles[i - 1].timestamp;

      let bullish = 0;
      let bearish = 0;

      if (closeNow > closePast) bullish++; else bearish++;
      if (avgNow > avgPast) bullish++; else bearish++;

      // aquí no fem res extra: només mantenim la mateixa estructura
      void nowTs2;
      void bullish;
      void bearish;
    }

    prevMsRaw = msRaw;
    prevEsRaw = esRaw;
  }

  return { signals };
}

// -------------------------------------------------------------
// FIAT 2.0 — Pesos per cripto (1:1 TradingView)
// -------------------------------------------------------------
const FIAT2_CONFIG = {
  "ADA-USDT":   { wMag: 1, wMacd: 1, wTrend: 4, wSat: 1, thr: 1 },
  "APT-USDT":   { wMag: 0, wMacd: 1, wTrend: 1, wSat: 0, thr: 1 },
  "ARB-USDT":   { wMag: 0, wMacd: 1, wTrend: 2, wSat: 1, thr: 1 },
  "ASTER-USDT": { wMag: 1, wMacd: 1, wTrend: 4, wSat: 0, thr: 1 },
  "ATOM-USDT":  { wMag: 0, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },
  "AVAX-USDT":  { wMag: 0, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },
  "BCH-USDT":   { wMag: 0, wMacd: 1, wTrend: 1, wSat: 0, thr: 1 },
  "BNB-USDT":   { wMag: 1, wMacd: 1, wTrend: 4, wSat: 1, thr: 1 },
  "BTC-USDT":   { wMag: 0, wMacd: 1, wTrend: 2, wSat: 1, thr: 1 },
  "DOT-USDT":   { wMag: 1, wMacd: 1, wTrend: 4, wSat: 0, thr: 1 },
  "ETH-USDT":   { wMag: 1, wMacd: 1, wTrend: 2, wSat: 1, thr: 1 },
  "HBAR-USDT":  { wMag: 1, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },
  "INJ-USDT":   { wMag: 0, wMacd: 1, wTrend: 2, wSat: 1, thr: 1 },
  "NEAR-USDT":  { wMag: 1, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },
  "OP-USDT":    { wMag: 0, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },
  "RENDER-USDT":{ wMag: 0, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },
  "SEI-USDT":   { wMag: 0, wMacd: 1, wTrend: 2, wSat: 1, thr: 1 },
  "SUI-USDT":   { wMag: 2, wMacd: 1, wTrend: 2, wSat: 1, thr: 1 },
  "VIRTUAL-USDT":{ wMag: 0, wMacd: 1, wTrend: 1, wSat: 0, thr: 1 },
  "XRP-USDT":   { wMag: 0, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },

  // ja existien:
  "LINK-USDT":  { wMag: 0, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 },
  "SOL-USDT":   { wMag: 1, wMacd: 1, wTrend: 2, wSat: 0, thr: 1 }
};



// -------------------------------------------------------------
// FIAT 2.0 — Obtenir configuració per cripto
// -------------------------------------------------------------
function getFiat2Config(symbol) {
  return FIAT2_CONFIG[symbol] || { wMag: 0, wMacd: 1, wTrend: 1, wSat: 0, thr: 1 };
}

// -------------------------------------------------------------
// FIAT 2.0 — Càlcul del score (1:1 TradingView)
// -------------------------------------------------------------
function applyFiat2Score(magPts, macdPts, trendPts, satPts, symbol) {
  const cfg = getFiat2Config(symbol);

  const score =
    cfg.wMag   * magPts +
    cfg.wMacd  * macdPts +
    cfg.wTrend * trendPts +
    cfg.wSat   * satPts;

  const isGood = score >= cfg.thr;

  return { score, isGood, magPts, macdPts, trendPts, satPts };
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
