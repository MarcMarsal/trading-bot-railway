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

  const params = [symbol, timeframe, type, timestamp];

  console.log("alreadySent2 CHECK QUERY:", {
    query: query.replace(/\s+/g, " "),
    params
  });

  const q = await client.query(query, params);

  console.log("alreadySent2 RESULT:", q.rowCount);

  return q.rowCount > 0;
}
