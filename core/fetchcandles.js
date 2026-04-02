import axios from "axios";
import { client } from "../db/client.js";

const API_URL = process.env.API_URL;

// Validació robusta del timestamp (en segons)
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000) return null; // timestamps en segons (2020+)
  return raw;
}

// -------------------------------------------------------------
// FETCH + STORE CANDLES (limit=2, amb timestamp_es i date_es)
// -------------------------------------------------------------
export async function fetchAndStoreCandles(symbol, timeframe) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${timeframe}&limit=10`;

    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return;

    // Guardem les dues veles: actual i tancada
    for (const k of data) {
      const rawTs = normalizeTimestamp(parseInt(k[0])) ?? Math.floor(Date.now() / 1000);
      const timestamp = rawTs; // ES GUARDA EN SEGONS (COM TENS ARA)

      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);

      // -------------------------------------------------------------
      // TIMESTAMP_ES I DATE_ES (imprescindibles pel panell i el bot)
      // -------------------------------------------------------------

      // timestamp_es = timestamp convertit a ms + zona horària Madrid
      const timestamp_es = new Date(
        new Date(timestamp * 1000).toLocaleString("en-US", {
          timeZone: "Europe/Madrid"
        })
      ).getTime();

      // date_es = format humà per al panell
      const date_es = new Date(timestamp * 1000).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).replace(",", "");

      // -------------------------------------------------------------
      // INSERT COMPLET (amb timestamp_es i date_es)
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
