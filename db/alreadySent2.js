// db/alreadySent2.js
// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, entry, dayKey, status = null) {
  let query, params;

  if (status) {
    query = `
      SELECT 1 FROM signals2
      WHERE symbol = $1
        AND timeframe = $2
        AND type = $3
        AND entry = $4
        AND LEFT(date_es, 10) = $5
        AND status = $6
      LIMIT 1
    `;
    params = [symbol, timeframe, type, entry, dayKey, status];
  } else {
    query = `
      SELECT 1 FROM signals2
      WHERE symbol = $1
        AND timeframe = $2
        AND type = $3
        AND entry = $4
        AND LEFT(date_es, 10) = $5
      LIMIT 1
    `;
    params = [symbol, timeframe, type, entry, dayKey];
  }

  // 🔥 DEBUG: mostra la query i els valors
  console.log("\n--- alreadySent2 DEBUG ---");
  console.log("QUERY:", query.trim());
  console.log("PARAMS:", params);

  const q = await client.query(query, params);

  console.log("ROWCOUNT:", q.rowCount);
  console.log("--------------------------\n");

  return q.rowCount > 0;
}
