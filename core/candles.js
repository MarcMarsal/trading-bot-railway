// core/candles.js
import { client } from "../db/client.js";

export async function getCandles(symbol, timeframe, limit = 100) {
  const q = await client.query(
    `
    SELECT open, high, low, close, volume, timestamp
    FROM candles
    WHERE symbol = $1
      AND timeframe = $2
    ORDER BY timestamp DESC
    LIMIT $3
    `,
    [symbol, timeframe, limit]
  );

  // les volem en ordre antic → recent
  return q.rows.reverse();
}
