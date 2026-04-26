// db/alreadySent2.js
import { client } from "./client.js";

export async function alreadySent2(symbol, timeframe, type, timestamp) {
  const ts = Number(timestamp); // assegurem BIGINT

  // Només per veure la query exacta
  const debugQuery = `
SELECT 1 FROM signals2
WHERE symbol = '${symbol}'
  AND timeframe = '${timeframe}'
  AND type = '${type}'
  AND timestamp = ${ts}
LIMIT 1;
`;

  console.log("\n--- alreadySent2 FINAL QUERY ---");
  console.log(debugQuery);
  console.log("--------------------------------\n");

  const query = `
    SELECT 1 FROM signals2
    WHERE symbol = $1
      AND timeframe = $2
      AND type = $3
      AND timestamp = $4
    LIMIT 1
  `;

  const params = [symbol, timeframe, type, ts];
  const q = await client.query(query, params);

  console.log("alreadySent2 RESULT:", q.rowCount);

  return q.rowCount > 0;
}

