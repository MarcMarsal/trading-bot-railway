// fetchCandlesBitunix.js

import axios from "axios";
import { client } from "../db/client.js";

const API_URL = process.env.API_URL; 
// A Railway tens: https://api.bitunix.com/api/v1/market/kline

// Normalització del timestamp
function normalizeTimestamp(raw) {
  if (!raw || typeof raw !== "number") return null;
  if (raw < 1600000000000) return null;
  return raw;
}

export async function fetchAndStoreCandles2(symbol, timeframe) {
  try {
    const interval = timeframe.toLowerCase(); // "1H" → "1h"
    const url = `${API_URL}?symbol=${symbol}&interval=${interval}&limit=4`;

    // IMPORTANT: Sense headers, sense API Key, sense signatura
    const res = await axios.get(url);

    if (!res.data || !res.data.data || res.data.data.length === 0) {
      console.log("⚠️ Bitunix no ha retornat dades");
      return;
    }

    const data = res.data.data;

    for (const k of data) {
      const rawTs = normalizeTimestamp(parseInt(k[0]));
      if (!rawTs) continue;

      const timestamp = rawTs;
      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);

      const timestamp_es = new Date(
        new Date(timestamp).toLocaleString("en-US", {
          timeZone: "Europe/Madrid"
        })
      ).getTime();

      const date_es = new Date(timestamp).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).replace(",", "");

      await client.query(
        `
        INSERT INTO candles2 (symbol, timeframe, timestamp, open, high, low, close, volume, timestamp_es, date_es)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (symbol, timeframe, timestamp)
        DO UPDATE SET
          open=$4, high=$5, low=$6, close=$7, volume=$8,
          timestamp_es=$9, date_es=$10;
        `,
        [
          symbol,
          timeframe,
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          timestamp_es,
          date_es
        ]
      );
    }

    console.log(`✔ Candles Bitunix SPOT guardades: ${symbol} ${timeframe}`);

  } catch (err) {
    console.log("❌ Error descarregant vela Bitunix SPOT:", symbol, timeframe, err.message);
  }
}
