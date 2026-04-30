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
export function formatSpainTime(tsMs) {
  const d = new Date(tsMs);
  return d.toLocaleTimeString("es-ES", { hour12: false });
}

export function splitSpainDate(tsMs) {
  const d = new Date(tsMs);

  const date_es = d.toLocaleDateString("es-ES");
  const hora_es = d.toLocaleTimeString("es-ES", { hour12: false });

  return {
    date_es,
    hora_es,
    timestamp_es: tsMs
  };
}

export function getDay(tsMs) {
  const d = new Date(tsMs);
  return d.getDay(); // 0 = diumenge
}
