// core/microimpulse.js
import { detectPattern, body } from "./patterns.js";

export function classifySignal(velas) {
  if (!velas || velas.length < 4) return null;

  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);

  if (!v1 || !v2 || !v3) return null;
  if (!v3.close || !v3.open || !v3.timestamp) return null;
  if (!msNow && !esNow) return null;

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
