// core/microimpulse2.js

import { detectMSES } from "./patterns.js";

// -------------------------------------------------------------
// VALIDACIÓ DE TIMESTAMP
// -------------------------------------------------------------
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000000) return null; // <-- ÚNIC CANVI
  return raw; // ms
}

// -------------------------------------------------------------
// EMA
// -------------------------------------------------------------
function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// -------------------------------------------------------------
// MICROIMPULSE EXACTAMENT COM TRADINGVIEW (VERSIÓ CORRECTA)
// -------------------------------------------------------------
export function detectMicroimpulse(candles, symbol, timeframe, prevState = {}) {
  if (!candles || candles.length < 30) {
    return { signal: null, state: prevState };
  }

  // Ordenem per seguretat
  candles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const n = candles.length;

  // curr = vela en formació (NO s'usa per condicions)
  const curr  = candles[n - 1];

  // 3 veles tancades
  const last  = candles[n - 2]; // última tancada
  const prev1 = candles[n - 3];
  const prev2 = candles[n - 4];

  if (!curr || !last || !prev1 || !prev2) {
    return { signal: null, state: prevState };
  }

  // EMA EXACTA com Pine
  const closes = candles.slice(0, n - 1).map(c => c.close); // només tancades
  const ema20 = calcEMA(closes, 20);
  if (!ema20) {
    return { signal: null, state: prevState };
  }

  // Tendència immediata (Pine) — només veles tancades
  const trendUp =
    last.close > prev1.close &&
    prev1.close >= prev2.close;

  const trendDown =
    last.close < prev1.close &&
    prev1.close <= prev2.close;

  // Retrace EXACTE com Pine — només veles tancades
  function isSmallRetrace(dirLong, o, h, l, c) {
    const body = Math.abs(c - o);
    const rng = h - l;
    const bodyPct = rng > 0 ? (body / rng) * 100 : 100;
    const colorOK = dirLong ? c < o : c > o;
    const distPct = Math.abs(((h + l) / 2 - ema20) / ema20) * 100;
    return bodyPct < 40 && colorOK && distPct < 0.5;
  }

  const dirLong = trendUp;

  const r1 = isSmallRetrace(dirLong, prev1.open, prev1.high, prev1.low, prev1.close);
  const r2 = isSmallRetrace(dirLong, prev2.open, prev2.high, prev2.low, prev2.close);

  const retrace = r1 || r2;
  if (!retrace) {
    return { signal: null, state: prevState };
  }

  const retraceHigh = Math.max(prev1.high, prev2.high);
  const retraceLow  = Math.min(prev1.low, prev2.low);

  // Breakout — només veles tancades
  const microLong =
    trendUp &&
    retrace &&
    last.high > retraceHigh &&
    last.close > retraceHigh;

  const microShort =
    trendDown &&
    retrace &&
    last.low < retraceLow &&
    last.close < retraceLow;

  // Equivalent a not microLong[1]
  const prevMicroLong  = prevState.prevMicroLong ?? false;
  const prevMicroShort = prevState.prevMicroShort ?? false;

  let signal = null;

  // IMPORTANT:
  // timestamp = curr.timestamp → obertura de la vela nova (com TradingView)
  if (microLong && !prevMicroLong) {
    signal = {
      symbol,
      timeframe,
      type: "MICRO_LONG",
      entry: last.close,
      timestamp: curr.timestamp,
      reason: "microimpulse",
      sensitivity: 40,
      status: "confirmed",
    };
  }

  if (microShort && !prevMicroShort) {
    signal = {
      symbol,
      timeframe,
      type: "MICRO_SHORT",
      entry: last.close,
      timestamp: curr.timestamp,
      reason: "microimpulse",
      sensitivity: 40,
      status: "confirmed",
    };
  }

  return {
    signal,
    state: {
      prevMicroLong: microLong,
      prevMicroShort: microShort,
    },
  };
}
