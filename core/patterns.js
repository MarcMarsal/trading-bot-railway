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

  // -------------------------------------------------------------
  // 1) MAPPING DE VELES (1:1 TradingView)
  // -------------------------------------------------------------
  const c0 = candles[n - 1]; // vela actual (oberta)
  const c1 = candles[n - 2]; // 1a tancada
  const c2 = candles[n - 3]; // 2a tancada
  const c3 = candles[n - 4]; // 3a tancada

  // -------------------------------------------------------------
  // 2) DETECCIÓ MS / ES (RAW)
  // -------------------------------------------------------------
  const indecision = (mid, first) => {
    const r = first.high - first.low;
    if (r === 0) return true;
    return Math.abs(mid.close - mid.open) < r * 0.3;
  };

  const msRaw =
    isBear(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBull(c1.open, c1.close);

  const esRaw =
    isBull(c3.open, c3.close) &&
    indecision(c2, c3) &&
    isBear(c1.open, c1.close);

  // -------------------------------------------------------------
  // 3) MAGNITUD FIAT
  // -------------------------------------------------------------
  const bodyFirst = Math.abs(c3.close - c3.open);
  const bodyThird = Math.abs(c1.close - c1.open);
  const magOK = bodyThird > bodyFirst * 0.6;

  // -------------------------------------------------------------
  // 4) MACD FIAT + SATURACIÓ
  // -------------------------------------------------------------
  const closes = candles.map(c => c.close);

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signalLine[i]);

  const histSmooth = ema(hist, 5);
  const histStdev = stdev(histSmooth, 20);

  const bullishSat = histSmooth[histSmooth.length - 1] > histStdev * 2.5;
  const bearishSat = histSmooth[histSmooth.length - 1] < -histStdev * 2.5;

  const macdSignal = histSmooth[histSmooth.length - 1] > 0 ? 1 :
                     histSmooth[histSmooth.length - 1] < 0 ? -1 : 0;

  // -------------------------------------------------------------
  // 5) TENDÈNCIA 12 HORES (1:1 TradingView)
  // -------------------------------------------------------------
  const tfMinutes = timeframe === "1H" ? 60 : 1440;
  const bars12h = Math.floor(12 * 60 / tfMinutes);

  const enough = n > bars12h + 5;

  const closeNow = c0.close;
  const closePast = enough ? candles[n - 1 - bars12h].close : closeNow;

  const avgNow = sma(closes.slice(-bars12h), bars12h);
  const avgPast = enough ? sma(closes.slice(-(bars12h * 2), -bars12h), bars12h) : avgNow;

  const highNow = Math.max(...candles.slice(-bars12h).map(c => c.high));
  const highPast = enough ? Math.max(...candles.slice(-(bars12h * 2), -bars12h).map(c => c.high)) : highNow;

  const lowNow = Math.min(...candles.slice(-bars12h).map(c => c.low));
  const lowPast = enough ? Math.min(...candles.slice(-(bars12h * 2), -bars12h).map(c => c.low)) : lowNow;

  const trendUp12h =
    closeNow > closePast &&
    avgNow > avgPast &&
    highNow > highPast;

  const trendDown12h =
    closeNow < closePast &&
    avgNow < avgPast &&
    lowNow < lowPast;

  const trendSignal = trendUp12h ? 1 : trendDown12h ? -1 : 0;

  // -------------------------------------------------------------
  // 6) FIAT SCORING (1:1 TradingView)
  // -------------------------------------------------------------
  const magSignal = magOK ? 1 : -1;
  const satSignal = bullishSat ? 1 : bearishSat ? -1 : 0;

  // Exposicions FIAT (igual que l’indicador)
  const { magExp, macdExp, trendExp } = getExposures(symbol);

  const magPts = magSignal === 1 ? magExp : 0;
  const macdPts = macdSignal === 1 ? macdExp : 0;
  const trendPts = trendSignal === 1 ? trendExp : 0;
  const satPts = satSignal === 1 ? 1 : 0;

  let score = magPts + macdPts + trendPts + satPts;

  if (macdPts > 0 && trendPts > 0) score += 1;
  if (macdPts > 0 && satPts > 0) score += 1;

  const isGood = score >= 1;

  // -------------------------------------------------------------
  // 7) GENERAR SENYALS (1:1 TradingView)
  // -------------------------------------------------------------
  const signals = [];
  const ts = c1.timestamp; // EXACTAMENT igual que l’indicador

  if (msRaw) {
    signals.push({
      symbol,
      timeframe,
      type: "M",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      score,
      isGood
    });
  }

  if (esRaw) {
    signals.push({
      symbol,
      timeframe,
      type: "E",
      timestamp: ts,
      entry: c1.close,
      thirdCandle: c1,
      score,
      isGood
    });
  }

  return { signals };
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
