// core/microimpulse2.js

// candles: array d'objectes { open, high, low, close, volume, timestamp }
// reliability: resultat de calcReliability(candles)
// timeframe, symbol només per etiquetar el senyal

function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function getTrendDirection(reliability) {
  // assumim que trendPercent > 50 = tendència
  if (reliability.trendPercent >= 50 && reliability.msPercent < 50) {
    // direcció segons context o segons últimes veles
    // simplifiquem: si msNow és true → possible gir alcista, si esNow → baixista
    // però per microimpulsos volem seguir la direcció dominant de les veles
    return reliability.trendLabel === "LONG" || reliability.msNow ? "LONG" : "SHORT";
  }
  return null;
}

function isSmallRetraceCandle(candle, direction, ema20, maxDistancePct = 0.5) {
  const { open, close, high, low } = candle;
  const body = Math.abs(close - open);
  const range = high - low;
  if (range === 0) return false;

  const bodyPct = (body / range) * 100;

  // cos petit
  if (bodyPct > 40) return false;

  // color contrari a la tendència
  const isRed = close < open;
  const isGreen = close > open;

  if (direction === "LONG" && !isRed) return false;
  if (direction === "SHORT" && !isGreen) return false;

  // distància a EMA20
  const mid = (high + low) / 2;
  const distPct = Math.abs((mid - ema20) / ema20) * 100;
  if (distPct > maxDistancePct) return false;

  return true;
}

function detectMicroimpulse(candles, reliability, symbol, timeframe) {
  if (!candles || candles.length < 30) return null;

  const direction = getTrendDirection(reliability);
  if (!direction) return null;

  // Capa 1: tendència viva ja ve donada per reliability (trendPercent, msPercent, volumOK, etc.)
  if (reliability.trendPercent < 50) return null;
  if (reliability.msPercent >= 50) return null;
  if (!reliability.volumeOK) return null;

  // Calculem EMA20 sobre els closes
  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes.slice(-25), 20); // últimes 25 per suavitzar
  if (!ema20) return null;

  // Agafem les últimes 4–5 veles per buscar retrocés curt
  const last = candles[candles.length - 1];
  const prev1 = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  // Capa 2: retrocés curt (1–2 veles)
  const retraceCandidates = [];
  if (isSmallRetraceCandle(prev1, direction, ema20)) retraceCandidates.push(prev1);
  if (isSmallRetraceCandle(prev2, direction, ema20)) retraceCandidates.push(prev2);

  if (retraceCandidates.length === 0) return null;

  // Definim màxim/mínim del retrocés
  const retraceHigh = Math.max(...retraceCandidates.map(c => c.high));
  const retraceLow = Math.min(...retraceCandidates.map(c => c.low));

  // Capa 3: confirmació
  let isConfirmed = false;
  let type = null;
  let entry = null;

  if (direction === "LONG") {
    // la vela actual trenca el màxim del retrocés i tanca per sobre
    if (last.high > retraceHigh && last.close > retraceHigh) {
      isConfirmed = true;
      type = "MICRO_LONG";
      entry = last.close;
    }
  } else if (direction === "SHORT") {
    // la vela actual trenca el mínim del retrocés i tanca per sota
    if (last.low < retraceLow && last.close < retraceLow) {
      isConfirmed = true;
      type = "MICRO_SHORT";
      entry = last.close;
    }
  }

  if (!isConfirmed) return null;

  const timestamp = last.timestamp || Date.now();

  const signal = {
    symbol,
    timeframe,
    type,                 // "MICRO_LONG" o "MICRO_SHORT"
    entry,
    timestamp,
    reason: "microimpulse",
    sensitivity: "normal", // de moment, després podem refinar
  };

  return signal;
}

export { detectMicroimpulse };
