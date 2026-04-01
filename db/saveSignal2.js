// db/saveSignal2.js
// db/saveSignal2.js
import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";

export async function saveSignal2({
  symbol,
  timeframe,
  type,
  entry,
  timestamp,   // ← sempre en mil·lisegons
  reason = "",
  sensitivity = null
}) {
  const tsMs = Number(timestamp);          // ms
  const tsSec = Math.floor(tsMs / 1000);   // segons

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
      tsSec,          // ← AIXÒ és el que va a la BD (segons)
      tsMs,           // ← timestamp_es (mil·lisegons)
      date_es,
      hora_es,
      reason,
      sensitivity
    ]
  );
}
