// db/saveSignal2.js

import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";
import { sendTelegram } from "../telegram/send.js";

export async function saveSignal2({
  symbol,
  timeframe,
  type,
  entry,
  entryr,
  tp,
  sl,
  timestamp,
  reason = "",
  sensitivity = null,
  status = "confirmed"
}) {
  const tsMs = Number(timestamp);
  const tsSec = Math.floor(tsMs / 1000);

  const { date_es, hora_es, timestamp_es } = splitSpainDate(tsMs);

  const expiresAt = tsMs + 3 * 60 * 1000;

  await client.query(
    `
    INSERT INTO signals2
      (symbol, timeframe, type,
       entry, entryr, tp, sl,
       timestamp, timestamp_es, date_es, hora_es,
       reason, sensitivity, expires_at, status)
    VALUES
      ($1,$2,$3,
       $4,$5,$6,$7,
       $8,$9,$10,$11,
       $12,$13,$14,$15)
    ON CONFLICT DO NOTHING
    `,
    [
      symbol,
      timeframe,
      type,
      entry,
      entryr,
      tp,
      sl,
      tsSec,
      tsMs,
      date_es,
      hora_es,
      reason,
      sensitivity,
      expiresAt,
      status
    ]
  );

  // 🔔 Enviar alerta Telegram
  await sendTelegram({
    symbol,
    signalType: type,
    entry,
    tp,
    sl
  });
}
