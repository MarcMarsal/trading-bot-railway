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
// FETCH + STORE CANDLES (limit=2, amb timestamp_es i date_es)
// -------------------------------------------------------------
export async function fetchAndStoreCandles(symbol, timeframe) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${timeframe}&limit=12`;

    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return;

    for (const k of data) {
      // OKX envia ms → ho mantenim en ms
      const rawTs = normalizeTimestamp(parseInt(k[0])) ?? Date.now();
      const timestamp = rawTs; // UTC en ms (com tens ara i com funcionava abans)

      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);

      // ---------- TIMESTAMP_ES (ms en hora espanyola) ----------
      const timestamp_es = new Date(
        new Date(timestamp).toLocaleString("en-US", {
          timeZone: "Europe/Madrid"
        })
      ).getTime();

      // ---------- DATE_ES (string humà en hora espanyola) ----------
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
