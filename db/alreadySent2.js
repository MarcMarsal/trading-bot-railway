// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, timestamp) {
  const query = `
    SELECT 1 FROM signals2
    WHERE symbol = $1
      AND timeframe = $2
      AND type = $3
      AND timestamp = $4
    LIMIT 1
  `;
  console.log("alreadySent2 CHECK:", symbol, timeframe, type, timestamp);

  const params = [symbol, timeframe, type, timestamp];
  const q = await client.query(query, params);
  return q.rowCount > 0;
}

