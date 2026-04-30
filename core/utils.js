// core/utils.js — FIAT v1 (helpers lògics)

// -----------------------------
// BULL / BEAR / BODY
// -----------------------------
export function isBull(o, c) {
  return c > o;
}

export function isBear(o, c) {
  return c < o;
}

export function body(o, c) {
  return Math.abs(c - o);
}

// -----------------------------
// DATE HELPERS (igual que abans)
// -----------------------------
// -----------------------------
// DATE HELPERS FIAT v1 (robustos)
// -----------------------------
export function formatSpainTime(tsMs) {
  if (tsMs === null || tsMs === undefined) return "-";

  // Convertir a número de forma segura
  const n = Number(String(tsMs).trim());
  if (!Number.isFinite(n)) return "-";

  const d = new Date(n);
  if (isNaN(d.getTime())) return "-";

  return d.toLocaleTimeString("es-ES", {
    hour12: false,
    timeZone: "Europe/Madrid"
  });
}


export function splitSpainDate(tsMs) {
  const n = Number(String(tsMs).trim());
  const d = new Date(n);

  if (isNaN(d.getTime())) {
    return {
      date_es: "-",
      hora_es: "-",
      timestamp_es: n
    };
  }

  const date_es = d.toLocaleDateString("es-ES");
  const hora_es = d.toLocaleTimeString("es-ES", { hour12: false });

  return {
    date_es,
    hora_es,
    timestamp_es: n
  };
}

export function getDay(tsMs) {
  const n = Number(String(tsMs).trim());
  const d = new Date(n);
  if (isNaN(d.getTime())) return null;
  return d.getDay();
}
