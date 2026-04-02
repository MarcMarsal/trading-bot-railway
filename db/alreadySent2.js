// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, timestamp, status = null) {
  let query, params;

  if (status) {
    // 🔥 Mode nou: comprovem també el status
    query = `
      SELECT 1 FROM signals2
      WHERE symbol = $1
        AND timeframe = $2
        AND type = $3
        AND timestamp = $4
        AND status = $5
      LIMIT 1
    `;
    params = [symbol, timeframe, type, timestamp, status];
  } else {
    // 🔥 Mode antic: compatibilitat total
    query = `
      SELECT 1 FROM signals2
      WHERE symbol = $1
        AND timeframe = $2
        AND type = $3
        AND timestamp = $4
      LIMIT 1
    `;
    params = [symbol, timeframe, type, timestamp];
  }

  const q = await client.query(query, params);
  return q.rowCount > 0;
}
