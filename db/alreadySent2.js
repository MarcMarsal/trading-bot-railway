// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, entry, date_es, status = null) {
  let query, params;

  if (status) {
    query = `
      SELECT 1 FROM signals2
      WHERE symbol = $1
        AND timeframe = $2
        AND type = $3
        AND entry = $4
        AND date_es = $5
        AND status = $6
      LIMIT 1
    `;
    params = [symbol, timeframe, type, entry, date_es, status];
  } else {
    query = `
      SELECT 1 FROM signals2
      WHERE symbol = $1
        AND timeframe = $2
        AND type = $3
        AND entry = $4
        AND date_es = $5
      LIMIT 1
    `;
    params = [symbol, timeframe, type, entry, date_es];
  }

  const q = await client.query(query, params);
  return q.rowCount > 0;
}
