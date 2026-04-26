// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, timestamp) {
  const ts = Number(timestamp);

  const query = `
    SELECT 1 FROM signals2
    WHERE symbol = $1
      AND timeframe = $2
      AND type = $3
      AND timestamp = $4
    LIMIT 1
  `;

  const params = [symbol, timeframe, type, ts];

  // 🔥 RECONSTRUCCIÓ DE LA QUERY EXACTA
  const finalQuery =
    query
      .replace("$1", `'${symbol}'`)
      .replace("$2", `'${timeframe}'`)
      .replace("$3", `'${type}'`)
      .replace("$4", ts);

  console.log("alreadySent2 FINAL QUERY:", finalQuery);

  const q = await client.query(query, params);

  console.log("alreadySent2 RESULT:", q.rowCount);

  return q.rowCount > 0;
}
