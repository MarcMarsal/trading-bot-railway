// core/utils.js

export function formatSpainTime(ts) {
  const date = new Date(ts);
  return date
    .toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
    .replace(",", "");
}

export function splitSpainDate(ts) {
  const s = formatSpainTime(ts); // "12/03/2024 15:45"
  const [date_es, hora_es] = s.split(" ");
  return { date_es, hora_es, timestamp_es: ts };
}

export function calcCloseTimestamp(openTs, timeframe) {
  const tfMap = {
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1H": 60 * 60 * 1000,
    "4H": 4 * 60 * 60 * 1000
  };
  return openTs + (tfMap[timeframe] || 0);
}

export function getDay(tsMs) {
  const d = new Date(tsMs);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}
