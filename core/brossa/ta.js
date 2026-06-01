// core/ta.js — FIAT v1 (tècnica pura)

// -----------------------------
// SMA
// -----------------------------
export function sma(arr, period) {
  if (!arr || arr.length < period) return null;
  const slice = arr.slice(arr.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// -----------------------------
// EMA
// -----------------------------
export function ema(values, period) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArr = [];
  let prev = values[0];
  emaArr.push(prev);

  for (let i = 1; i < values.length; i++) {
    const v = values[i] * k + prev * (1 - k);
    emaArr.push(v);
    prev = v;
  }
  return emaArr;
}

// -----------------------------
// ATR ARRAY (igual que TradingView)
// -----------------------------
export function calcATRArray(candles, period = 14) {
  if (!candles || candles.length < period + 1) return [];

  const atrs = [];

  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;

    const tr = Math.max(
      h - l,
      Math.abs(h - pc),
      Math.abs(l - pc)
    );

    if (i >= period) {
      const slice = atrs.slice(-(period - 1));
      const prevTR = [...slice, tr];
      const atr = prevTR.reduce((a, b) => a + b, 0) / prevTR.length;
      atrs.push(atr);
    } else {
      atrs.push(tr);
    }
  }

  return atrs;
}

// -----------------------------
// STDEV
// -----------------------------
export function stdev(arr, period) {
  if (!arr || arr.length < period) return 0;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  return Math.sqrt(variance);
}
