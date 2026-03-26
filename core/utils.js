// -------------------------------------------------------------
// FORMATAR TIMESTAMP A HORA D'ESPANYA
// -------------------------------------------------------------
function formatSpainTime(timestamp) {
  // OKX envia timestamps en mil·lisegons
  const date = new Date(Number(timestamp));

  // Convertim a hora d'Espanya (CET/CEST)
  const options = {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  };

  return date.toLocaleString("es-ES", options);
}

// -------------------------------------------------------------
// SLEEP (per proves o debugs)
// -------------------------------------------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -------------------------------------------------------------
// ARRODONIR (si algun dia ho necessitem)
// -------------------------------------------------------------
function round(value, decimals = 4) {
  return Number(value.toFixed(decimals));
}

module.exports = {
  formatSpainTime,
  sleep,
  round
};
