import axios from "axios";
import { client } from "../db/client.js";

const API_URL = process.env.API_URL;

// Validació robusta del timestamp (en mil·lisegons)
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000000) return null; // ms (2020+)
  return raw;
}

// -------------------------------------------------------------
// FETCH + STORE CANDLES (sense intravela, només veles tancades)
// -------------------------------------------------------------
export async function fetchAndStoreCandles(symbol, timeframe) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${timeframe}&limit=3`;

    const res = await axios.get(url);
    let data = res.data.data;

    if (!data || data.length === 0) return;

    // -------------------------------------------------------------
    // 1) Timeframe en ms
    // -------------------------------------------------------------
    const timeframeMs = {
      "15m": 15 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1H": 60 * 60 * 1000
    }[timeframe];

    const now = Date.now();

    // -------------------------------------------------------------
    // 2) Processar només veles TANCADES
    //    (timestamp + timeframeMs <= now)
    // -------------------------------------------------------------
    for (const k of data) {
      const rawTs = normalizeTimestamp(parseInt(k[0]));
      if (!rawTs) continue;

      const timestamp = rawTs;

      // ❗ Vela oberta → descartar
      if (timestamp + timeframeMs > now) continue;

      // Ara sí: és una vela tancada
      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);

      // Timestamp en hora espanyola
      const timestamp_es = new Date(
        new Date(timestamp).toLocaleString("en-US", {
          timeZone: "Europe/Madrid"
        })
      ).getTime();

      // Data humana en hora espanyola
      const date_es = new Date(timestamp).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).replace(",", "");

      // -------------------------------------------------------------
      // 3) INSERT / UPDATE
      // -------------------------------------------------------------
      await client.query(
        `
        INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume, timestamp_es, date_es)
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

  } catch (err) {
    console.log("Error descarregant vela:", symbol, timeframe, err.message);
  }
}
