// core/patterns.js

export function body(o, c) {
  return Math.abs(c - o);
}

export function range(h, l) {
  return h - l;
}

export function bodyPct(o, h, l, c) {
  const r = range(h, l);
  return r === 0 ? 0 : body(o, c) / r;
}

export function isBull(o, c) {
  return c > o;
}

export function isBear(o, c) {
  return c < o;
}

export function isStrongBull(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  return bp >= 0.5 && isBull(o, c);
}

export function isStrongBear(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  return bp >= 0.5 && isBear(o, c);
}

export function isIndecision(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  return bp <= 0.3;
}

export function velaCompleta(v) {
  return (
    v &&
    v.open != null &&
    v.close != null &&
    v.high != null &&
    v.low != null &&
    v.timestamp != null
  );
}

export function midpoint(v) {
  return (v.high + v.low) / 2;
}

export function smallBody(v, maxPct = 0.3) {
  const r = v.high - v.low;
  if (r === 0) return false;
  return Math.abs(v.close - v.open) / r < maxPct;
}

// -------------------------------------------------------------
// MS/ES FIAT (1:1 amb TradingView)
// -------------------------------------------------------------
export function detectMSES(velas) {
  if (!velas || velas.length < 4) return { ms: false, es: false };

  const n = velas.length;
  const v1 = velas[n - 4];
  const v2 = velas[n - 3];
  const v3 = velas[n - 2];

  if (!v1 || !v2 || !v3) return { ms: false, es: false };

  const strongBull = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return false;
    return body / range >= 0.5 && v.close > v.open;
  };

  const strongBear = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return false;
    return body / range >= 0.5 && v.close < v.open;
  };

  const indecision = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return true;
    return body / range <= 0.3;
  };

  const mid1 = midpoint(v1);

  const ms =
    strongBear(v1) &&
    indecision(v2) &&
    strongBull(v3) &&
    v3.close > mid1;

  const es =
    strongBull(v1) &&
    indecision(v2) &&
    strongBear(v3) &&
    v3.close < mid1;

  return { ms, es };
}
