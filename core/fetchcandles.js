import axios from "axios";
import { client } from "../db/client.js";

const API_URL = process.env.API_URL;

// Validació robusta del timestamp
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000) return null; // només timestamps reals (2020+)
  return raw;
}

// -------------------------------------------------------------
// FETCH + STORE CANDLES (CORREGIT, limit=2)
// -------------------------------------------------------------
export async function fetchAndStoreCandles(symbol, interval) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${interval}&limit=10`;

    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return;

    // Guardem les dues veles: actual i tancada
    for (const k of data) {
      const rawTs = normalizeTimestamp(parseInt(k[0])) ?? Date.now();
      //const timestamp = Math.floor(rawTs / 1000);
      const timestamp = rawTs;
      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);

      await client.query(
        `
        INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (symbol, timeframe, timestamp)
        DO UPDATE SET open=$4, high=$5, low=$6, close=$7, volume=$8;
        `,
        [symbol, interval, timestamp, open, high, low, close, volume]
      );
    }

  } catch (err) {
    console.log("Error descarregant vela:", symbol, interval, err.message);
  }
}
