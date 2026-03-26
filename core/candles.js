const axios = require("axios");
const { client } = require("../db/client");

// -------------------------------------------------------------
// FORMAT FUNCTIONS (igual que al bot de 15m)
// -------------------------------------------------------------
function formatSpainTime(ts) {
  return new Date(ts).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
}

function formatSpainDate(ts) {
  return new Date(ts).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
}

const API_URL = "https://www.okx.com/api/v5/market/candles";

// -------------------------------------------------------------
// FETCH CANDLES FROM OKX
// -------------------------------------------------------------
async function fetchCandles(symbol, timeframe) {
  try {
    const instId = symbol;
    const url = `${API_URL}?instId=${instId}&bar=${timeframe}&limit=100`;

    const { data } = await axios.get(url);

    if (!data || !data.data) {
      console.error("OKX response invalid:", data);
      return null;
    }

    // OKX retorna les veles de més nova a més antiga → invertim
    const candles = data.data.reverse().map(c => ({
      openTime: Number(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      timestamp: Number(c[0])
    }));

    return candles;

  } catch (err) {
    console.error(`Error fetchCandles OKX ${symbol} ${timeframe}:`, err.message);
    return null;
  }
}

// -------------------------------------------------------------
// SAVE CANDLES TO DATABASE (versió completa amb timestamp_es i date_es)
// -------------------------------------------------------------
async function saveCandles(symbol, timeframe, candles) {
  try {
    for (const c of candles) {

      const timestamp = c.timestamp;
      const timestamp_es = formatSpainTime(timestamp);
      const date_es = formatSpainDate(timestamp);

      await client.query(
        `INSERT INTO candles 
          (symbol, timeframe, open, high, low, close, volume, timestamp, timestamp_es, date_es)
         VALUES 
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (symbol, timeframe, timestamp)
         DO UPDATE SET 
            open=$3, 
            high=$4, 
            low=$5, 
            close=$6, 
            volume=$7,
            timestamp_es=$9,
            date_es=$10`,
        [
          symbol,
          timeframe,
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume,
          timestamp,
          timestamp_es,
          date_es
        ]
      );
    }
  } catch (err) {
    console.error(`Error saveCandles ${symbol} ${timeframe}:`, err.message);
  }
}

module.exports = {
  fetchCandles,
  saveCandles
};
