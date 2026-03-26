const { client } = require("./client");

// -------------------------------------------------------------
// GUARDAR SENYAL (bot de 5m)
// -------------------------------------------------------------
async function saveSignal5m(symbol, timeframe, tipo, entry, timestamp, timestampEs) {
  try {
    await client.query(
      `INSERT INTO signals_5m (symbol, timeframe, tipo, entry, timestamp, timestamp_es)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [symbol, timeframe, tipo, entry, timestamp, timestampEs]
    );
  } catch (err) {
    console.error("Error saveSignal5m:", err.message);
  }
}

// -------------------------------------------------------------
// COMPROVAR SI JA S'HA ENVIAT (bot de 5m)
// -------------------------------------------------------------
async function alreadySent5m(symbol, timeframe, tipo, timestamp) {
  try {
    const q = await client.query(
      `SELECT 1 FROM signals_5m
       WHERE symbol = $1
         AND timeframe = $2
         AND tipo = $3
         AND timestamp = $4
       LIMIT 1`,
      [symbol, timeframe, tipo, timestamp]
    );

    return q.rowCount > 0;
  } catch (err) {
    console.error("Error alreadySent5m:", err.message);
    return false;
  }
}

module.exports = {
  saveSignal5m,
  alreadySent5m
};
