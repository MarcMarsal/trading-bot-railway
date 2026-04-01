// db/saveSignal2.js
import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";

export async function saveSignal2({
  symbol,
  timeframe,
  type,
  entry,
  timestamp,   // <-- arriba en segons
  reason = "",
  sensitivity = null
}) {
  // Convertim a mil·lisegons
  const tsMs = timestamp * 1000;

  // splitSpainDate espera mil·lisegons
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
      timestamp,      // <-- en segons (UTC)
      timestamp_es,   // <-- correcte (ms)
      date_es,
      hora_es,
      reason,
      sensitivity
    ]
  );
}
