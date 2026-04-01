// db/saveSignal2.js
import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";

export async function saveSignal2({
  symbol,
  timeframe,
  type,
  entry,
  timestamp,
  reason = "",
  sensitivity = null
}) {
  // Detectem si el timestamp és en segons o mil·lisegons
  const tsMs = timestamp < 2000000000 ? timestamp * 1000 : timestamp;

  const { date_es, hora_es, timestamp_es } = splitSpainDate(tsMs);

  await client.query(
    `
    INSERT INTO signals2
      (symbol, timeframe, type, entry, timestamp,
       timestamp_es, date_es, hora_es,
       reason, sensitivity)
    VALUES
      ($1,$2,$3,$4,$5,
       $6,$7,$8,
       $9,$10)
    ON CONFLICT DO NOTHING
    `,
    [
      symbol,
      timeframe,
      type,
      entry,
      timestamp,      // guardem l’original
      timestamp_es,   // ms correctes
      date_es,
      hora_es,
      reason,
      sensitivity
    ]
  );
}
