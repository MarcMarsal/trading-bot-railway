// db/saveSignal2.js — FIAT v1 net i 100% en mil·lisegons

import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";
import { sendTelegram } from "../telegram/send.js";

/**
 * Guarda una senyal FIAT v1 a la taula signals2
 *
 * - timestamp = moment de la vela (ms)
 * - created_at = moment real en què el bot crea la senyal (ms)
 */
export async function saveSignal2({
  symbol,
  timeframe,
  type,        // "M" o "E"
  entry,
  entryr,
  tp,
  sl,
  timestamp,   // ms (moment de la vela)
  reason = "",
  score = null,
  isGood = null
}) {
  const tsMs = Number(timestamp);   // ms de la vela
  const createdAt = Date.now();     // ms de creació real

  // Data ES basada en la vela (no en la creació)
  const { date_es, hora_es, timestamp_es } = splitSpainDate(tsMs);

  await client.query(
    `
    INSERT INTO signals2 (
      symbol,
      timeframe,
      type,
      entry,
      entryr,
      tp,
      sl,
      timestamp,       -- ms de la vela
      timestamp_ms,    -- ms de la vela
      timestamp_es,    -- ms zona ES (vela)
      date_es,
      hora_es,
      reason,
      score,
      is_good,
      created_at,      -- ms de creació real
      closed
    )
    VALUES (
      $1,$2,$3,
      $4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,$14,$15,
      $16,
      false
    )
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
      tsMs,          // timestamp (vela)
      tsMs,          // timestamp_ms (vela)
      timestamp_es,  // ms zona ES (vela)
      date_es,
      hora_es,
      reason,
      score,
      isGood,
      createdAt      // moment real de creació
    ]
  );

  // 🔔 Enviar alerta Telegram (FIAT v1)
  await sendTelegram({
    symbol,
    signalType: type,
    entry,
    tp,
    sl,
    score,
    isGood
  });
}
