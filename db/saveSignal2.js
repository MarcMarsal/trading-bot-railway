// db/saveSignal2.js — FIAT v2 complet i 1:1 amb TradingView

import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";
import { sendTelegram } from "../telegram/send.js";

/**
 * Guarda una senyal FIAT v2 a la taula signals2
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
  isGood = null,

  // 🔥 FIAT — punts
  magPts = null,
  macdPts = null,
  trendPts = null,
  satPts = null,

  // 🔥 FIAT — dades congelades de tendència
  closeNow = null,
  closePast = null,
  avgNow = null,
  avgPast = null,
  pastIndex = null,
  pastTs = null,
  targetTs = null,
  trendSignal = null,
  // 🟩 AFEGIT
  c1_open = null,
  c1_close = null,
  c2_open = null,
  c2_close = null,
  c3_open = null,
  c3_close = null
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
  timestamp,
  timestamp_ms,
  timestamp_es,
  date_es,
  hora_es,
  reason,
  score,
  is_good,

  mag_pts,
  macd_pts,
  trend_pts,
  sat_pts,

  close_now,
  close_past,
  avg_now,
  avg_past,
  past_index,
  past_ts,
  target_ts,
  trend_signal,

  -- 🟩 AFEGIT
  c1_open,
  c1_close,
  c2_open,
  c2_close,
  c3_open,
  c3_close,

  created_at,
  closed
)
VALUES (
  $1,$2,$3,
  $4,$5,$6,$7,
  $8,$9,$10,$11,$12,
  $13,$14,$15,

  $16,$17,$18,$19,

  $20,$21,$22,$23,$24,$25,$26,$27,

  -- 🟩 AFEGIT
  $28,$29,$30,$31,$32,$33,

  $34,
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
      tsMs,
      tsMs,
      timestamp_es,
      date_es,
      hora_es,
      reason,
      score,
      isGood,

      // 🔥 FIAT — punts
      magPts,
      macdPts,
      trendPts,
      satPts,

      // 🔥 FIAT — dades congelades
      closeNow,
      closePast,
      avgNow,
      avgPast,
      pastIndex,
      pastTs,
      targetTs,
      trendSignal,
 // 🟩 AFEGIT
  c1_open,
  c1_close,
  c2_open,
  c2_close,
  c3_open,
  c3_close,
      createdAt
    ]
  );

  // 🔔 Enviar alerta Telegram (FIAT v2)
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
