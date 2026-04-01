// core/reliability.js
import { detectPattern } from "./patterns.js";

export function calcReliability(candles) {
  if (!candles || candles.length < 60) {
    return {
      trendPercent: 0,
      msPercent: 0,
      contextLabel: "Sense dades",
      volumeOK: false,
      tendenciaPrincipal: "CAP",
      pullbackActiu: false,
      operarTendencia: false,
      msNow: false,
      esNow: false
    };
  }

  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // ATR
  let trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const atrNow = trs[trs.length - 1];
  const atrAvg = trs.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const condVolatility = atrNow > atrAvg * 0.8 && atrNow < atrAvg * 1.4;

  // Wicks
  function wickPct(c) {
    const range = c.high - c.low;
    if (range === 0) return 0;
    const upper = c.high - Math.max(c.open, c.close);
    const lower = Math.min(c.open, c.close) - c.low;
    return (upper + lower) / range;
  }
  const avgWick = candles.slice(-20).map(wickPct).reduce((a, b) => a + b, 0) / 20;
  const condWicks = avgWick < 0.40;

  // Volum relatiu
  const volNow = volumes[volumes.length - 1];
  const volAvg = volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const condVolume = volNow > volAvg * 0.6;

  // Swings
  let swingCount = 0;
  for (let i = candles.length - 16; i < candles.length; i++) {
    if (i <= 1) continue;
    const isHigh = highs[i] > highs[i - 1] && highs[i] > highs[i - 2];
    const isLow  = lows[i]  < lows[i - 1] && lows[i]  < lows[i - 2];
    if (isHigh || isLow) swingCount++;
  }
  const condSwings = swingCount >= 3;

  // Continuació
  let hasContinuation = false;
  for (let i = candles.length - 11; i < candles.length - 1; i++) {
    const cont = Math.abs(closes[i] - candles[i].open) / candles[i].open;
    if (cont > 0.0025) hasContinuation = true;
  }
  const condContinuation = hasContinuation;

  // EMA20 / EMA50
  function ema(arr, period) {
    const k = 2 / (period + 1);
    let e = arr[0];
    for (let i = 1; i < arr.length; i++) {
      e = arr[i] * k + e * (1 - k);
    }
    return e;
  }
  const ema20 = ema(closes.slice(-60), 20);
  const ema50 = ema(closes.slice(-60), 50);
  const lastClose = closes[closes.length - 1];
  const emaDist = Math.abs(ema20 - ema50) / lastClose;
  const condTrend = emaDist > 0.002 && emaDist < 0.015;

  // TREND PERCENT
  let trendScore = 0;
  if (condContinuation) trendScore += 20;
  if (condTrend)        trendScore += 20;
  if (condVolume)       trendScore += 20;
  if (condWicks)        trendScore += 10;
  if (condSwings)       trendScore += 10;
  if (condVolatility)   trendScore += 10;

  const trendStrength =
    emaDist > 0.008 ? 10 :
    emaDist > 0.004 ? 5  :
    0;

  trendScore += trendStrength;
  const trendPercent = Math.min(trendScore, 100);

  // MS/ES PERCENT
  let msScore = 0;
  if (condVolume)        msScore += 40;
  if (!condContinuation) msScore += 30;
  if (!condTrend)        msScore += 30;
  const msPercent = Math.min(msScore, 100);

  const { msNow, esNow } = detectPattern(candles);

  let tendenciaPrincipal = "CAP";
  if (ema20 > ema50) tendenciaPrincipal = "LONG";
  if (ema20 < ema50) tendenciaPrincipal = "SHORT";

  const pullbackActiu =
    (
      (tendenciaPrincipal === "LONG"  && lastClose < ema20 * 0.997) ||
      (tendenciaPrincipal === "SHORT" && lastClose > ema20 * 1.003) ||
      msPercent > 50
    );

  const operarTendencia =
    tendenciaPrincipal !== "CAP" &&
    !pullbackActiu &&
    trendPercent >= 50;

  let contextLabel = "Neutre";
  if (trendPercent >= 70 && msPercent < 40)
    contextLabel = "Tendència forta";
  else if (msPercent >= 70 && trendPercent < 40)
    contextLabel = "MS/ES favorable";
  else if (trendPercent < 40 && msPercent < 40)
    contextLabel = "No operar";

  return {
    trendPercent,
    msPercent,
    contextLabel,
    volumeOK: condVolume,
    tendenciaPrincipal,
    pullbackActiu,
    operarTendencia,
    msNow,
    esNow
  };
}
