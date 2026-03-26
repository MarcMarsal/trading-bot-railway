const { client } = require("./client");

// -------------------------------------------------------------
// GUARDAR SENYAL (bot principal)
// -------------------------------------------------------------
async function saveSignal(symbol, timeframe, tipo, entry, timestamp, timestampEs) {
  try {
    await client.query(
      `INSERT INTO signals (symbol, timeframe, tipo, entry, timestamp, timestamp_es)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [symbol, timeframe, tipo, entry, timestamp, timestampEs]
    );
  } catch (err) {
    console.error("Error saveSignal:", err.message);
  }
}

// -------------------------------------------------------------
// COMPROVAR SI JA S'HA ENVIAT (bot principal)
// -------------------------------------------------------------
async function alreadySent(symbol, timeframe, tipo, timestamp) {
  try {
    const q = await client.query(
      `SELECT 1 FROM signals
       WHERE symbol = $1
         AND timeframe = $2
         AND tipo = $3
         AND timestamp = $4
       LIMIT 1`,
      [symbol, timeframe, tipo, timestamp]
    );

    return q.rowCount > 0;
  } catch (err) {
    console.error("Error alreadySent:", err.message);
    return false;
  }
}

module.exports = {
  saveSignal,
  alreadySent
};
