// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, timestampMs) {
  const tsMs = Number(timestampMs);

  const query = `
    SELECT 1 FROM signals2
    WHERE symbol = $1
      AND timeframe = $2
      AND timestamp_ms = $3
    LIMIT 1
  `;

  const params = [symbol, timeframe, tsMs];

  // 🔥 DEBUG FIAT v1 — veure exactament què s'està buscant
  //console.log("[alreadySent2] QUERY:", query.trim());
  //console.log("[alreadySent2] PARAMS:", params);

  const q = await client.query(query, params);

  return q.rowCount > 0;
}
