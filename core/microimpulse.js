// core/microimpulse.js
import { detectPattern } from "./patterns.js";

function normalizeTimestamp(raw) {
  // Si no existeix → invalid
  if (raw === undefined || raw === null) return null;

  // Si no és número → invalid
  if (typeof raw !== "number") return null;

  // Si és 0 → invalid
  if (raw === 0) return null;

  // Si és massa petit → invalid (UNIX real > 1.000.000.000)
  if (raw < 1000000000) return null;

  return raw;
}

export function classifySignal(velas) {
  if (!velas || velas.length < 4) return null;

  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);
  if (!v1 || !v2 || !v3) return null;
  if (!v3.close || !v3.open) return null;
  if (!msNow && !esNow) return null;

  // 🔥 Timestamp universal i robust
 const rawTs =
  normalizeTimestamp(v3.timestamp) ??
  normalizeTimestamp(v3.time) ??
  normalizeTimestamp(v3.openTime) ??
  normalizeTimestamp(v3.closeTime) ??
  normalizeTimestamp(v3.t) ??
  normalizeTimestamp(v3.ts) ??
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
