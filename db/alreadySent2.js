// db/alreadySent2.js

import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, entry, dayKey, status = null) {
  if (!dayKey) {
    console.log("❌ alreadySent2() ERROR — dayKey invalid:", dayKey);
    return false;
  }

  let query = `
    SELECT 1 FROM signals2
    WHERE symbol = $1
      AND timeframe = $2
      AND type = $3
      AND entry = $4
      AND LEFT(date_es, 10) = $5
  `;

  const params = [symbol, timeframe, type, entry, dayKey];

  if (status) {
    query += ` AND status = $6 `;
    params.push(status);
  }

  query += ` LIMIT 1`;
  const q = await client.query(query, params);
  return q.rowCount > 0;
}
