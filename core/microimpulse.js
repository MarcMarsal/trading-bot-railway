// core/microimpulse.js
import { detectPattern } from "./patterns.js";

export function classifySignal(velas) {
  if (!velas || velas.length < 4) return null;

  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);
  if (!v1 || !v2 || !v3) return null;
  if (!v3.close || !v3.open) return null;
  if (!msNow && !esNow) return null;

  // 🔥 Timestamp universal i robust
  const rawTs =
    v3.timestamp ??
    v3.time ??
    v3.openTime ??
    v3.closeTime ??
    v3.t ??
    v3.ts ??
    Date.now();

  v3.timestamp = Math.floor(rawTs / 1000);

  const tipoBase = msNow ? "MS" : "ES";
  return { tipoBase, v3 };
}

export function calcTargets(tipoBase, entry, roi = 0.01) {
  if (tipoBase === "MS") {
    return {
      tp: entry * (1 + roi),
      sl: entry * (1 - roi)
    };
  } else {
    return {
      tp: entry * (1 - roi),
      sl: entry * (1 + roi)
    };
  }
}
