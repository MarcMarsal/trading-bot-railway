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

  // 🔥 Criptos ACTIVADES dilluns matí 00:00-14:00
  const ACTIVE_CRYPTOS_4H = [
    "APT-USDT",
    "BNB-USDT",
    "BTC-USDT",
    "ETH-USDT",
    "FET-USDT",
    "RENDER-USDT",
    "SOL-USDT",
    "XRP-USDT"
  ];
 
  // 🔥 Criptos ACTIVADES 
  const ACTIVE_CRYPTOS_1H = [
    "ARB-USDT",
    "FET-USDT",
    "INJ-USDT",
    "OP-USDT",
    "XRP-USDT"
  ];

  //const ACTIVE_CRYPTOS_1H = [
  //  "APT-USDT",
  //  "ATOM-USDT",
  //  "BTC-USDT",
  //  "ETH-USDT",
  //  "RENDER-USDT",
  //  "SOL-USDT"
  //];

  // Seleccionar llista segons timeframe
  const activeList = timeframe === "1H" ? ACTIVE_CRYPTOS_1H : ACTIVE_CRYPTOS_4H;
    
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
  //if (ACTIVE_CRYPTOS.includes(symbol)) {
  if (activeList.includes(symbol)) {
  
    await sendTelegram({
      symbol,
      timeframe,
      signalType: type,
      entry,
      tp,
      sl
    });
  }
}
  
