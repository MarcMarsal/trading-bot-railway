const axios = require("axios");
const { client } = require("../db/client");

const API_URL = "https://www.okx.com/api/v5/market/candles";

// -------------------------------------------------------------
// FETCH CANDLES FROM OKX
// -------------------------------------------------------------
async function fetchCandles(symbol, timeframe) {
  try {
    // OKX ja utilitza el format BTC-USDT, així que no modifiquem res
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
// SAVE CANDLES TO DATABASE
// -------------------------------------------------------------
async function saveCandles(symbol, timeframe, candles) {
  try {
    for (const c of candles) {
      await client.query(
        `INSERT INTO candles (symbol, timeframe, open, high, low, close, volume, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING`,
        [
          symbol,
          timeframe,
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume,
          c.timestamp
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
