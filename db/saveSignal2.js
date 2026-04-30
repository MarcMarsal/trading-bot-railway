// db/saveSignal2.js — FIAT v1 net

import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";
import { sendTelegram } from "../telegram/send.js";

/**
 * Guarda una senyal FIAT v1 a la taula signals2
 *
 * Espera:
 *  - timestamp en MIL·LISEGONS (el mateix que candles i TradingView)
 *  - score i isGood (del FIAT scoring)
 */
export async function saveSignal2({
  symbol,
  timeframe,
  type,        // "M" o "E"
  entry,
  entryr,
  tp,
  sl,
  timestamp,   // ms
  reason = "",
  score = null,
  isGood = null
}) {
  const tsMs = Number(timestamp);
  const tsSec = Math.floor(tsMs / 1000);

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
      timestamp,       -- en segons (per compatibilitat / index)
      timestamp_ms,    -- en ms (1:1 candles / TradingView)
      timestamp_es,    -- ms zona ES (per tracking humà)
      date_es,
      hora_es,
      reason,
      score,
      is_good,
      closed
    )
    VALUES (
      $1,$2,$3,
      $4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,$14,$15,
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
      tsSec,
      tsMs,
      timestamp_es,
      date_es,
      hora_es,
      reason,
      score,
      isGood
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
