// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, timestampMs) {
  const tsSec = Math.floor(Number(timestampMs) / 1000);

  const query = `
    SELECT 1 FROM signals2
    WHERE symbol = $1
      AND timeframe = $2
      AND type = $3
      AND timestamp = $4
    LIMIT 1
  `;

  const params = [symbol, timeframe, type, tsSec];
  const q = await client.query(query, params);

  return q.rowCount > 0;
}
