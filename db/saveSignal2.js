// db/saveSignal2.js — FIAT‑PRO (patrons + ATR + tracking)

import { client } from "./client.js";
import { splitSpainDate } from "../core/utils.js";
import { sendTelegram } from "../telegram/send.js";

/**
 * Guarda una senyal FIAT‑PRO a la taula signals2
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
  timestamp    // ms (moment de la vela)
}) {
  const tsMs = Number(timestamp);
  const createdAt = Date.now();
  
  // 🔥 Criptos ACTIVADES (les bones) amb el format real del bot
  const ACTIVE_CRYPTOS = [
    "ARB-USDT",
    "ATOM-USDT",
    "INJ-USDT",
    "RENDER-USDT",
    "SOL-USDT",
    "XRP-USDT"
  ];
  
  // Data ES basada en la vela
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
      created_at,
      closed
    )
    VALUES (
      $1,$2,$3,
      $4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,
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
      createdAt
    ]
  );

  // 🔔 Enviar alerta NOMÉS si la cripto està activada
  if (ACTIVE_CRYPTOS.includes(symbol)) {
    await sendTelegram({
      symbol,
      signalType: type,
      entry,
      tp,
      sl
    });
  }
}
  
