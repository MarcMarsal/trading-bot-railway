// fetchCandlesBitunix.js

import axios from "axios";
import crypto from "crypto";
import { client } from "../db/client.js";

const API_URL = process.env.API_URL; // https://api.bitunix.com/api/v1/market/kline
const BITUNIX_API_KEY = process.env.BITUNIX_API_KEY;
const BITUNIX_SECRET = process.env.BITUNIX_SECRET;

// Normalització del timestamp OKX (igual que abans)
function normalizeTimestamp(raw) {
  if (!raw || typeof raw !== "number") return null;
  if (raw < 1600000000000) return null;
  return raw;
}

// Funció per signar peticions Bitunix
function signRequest(timestamp, method, path, queryString) {
  const preSign = timestamp + method + path + queryString;
  return crypto
    .createHmac("sha256", BITUNIX_SECRET)
    .update(preSign)
    .digest("hex");
}

export async function fetchAndStoreCandles2(symbol, timeframe) {
  try {
    // Bitunix usa intervals: 1m, 5m, 15m, 1h, 4h, 1d...
    const interval = timeframe.toLowerCase(); // "1H" → "1h"

    const path = "/api/v1/market/kline";
    const queryString = `symbol=${symbol}&interval=${interval}&limit=4`;
    const url = `${API_URL}?${queryString}`;

    const timestamp = Date.now().toString();
    const method = "GET";

    const signature = signRequest(timestamp, method, path, queryString);

    const headers = {
      "X-Bitunix-ApiKey": BITUNIX_API_KEY,
      "X-Bitunix-Sign": signature,
      "X-Bitunix-Timestamp": timestamp,
      "Accept": "application/json"
    };

    const res = await axios.get(url, { headers });

    if (!res.data || !res.data.data || res.data.data.length === 0) {
      console.log("⚠️ Bitunix no ha retornat dades");
      return;
    }

    const data = res.data.data;

    for (const k of data) {
      const rawTs = normalizeTimestamp(parseInt(k[0]));
      if (!rawTs) continue;

      const timestampMs = rawTs;
      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);

      const timestamp_es = new Date(
        new Date(timestampMs).toLocaleString("en-US", {
          timeZone: "Europe/Madrid"
        })
      ).getTime();

      const date_es = new Date(timestampMs).toLocaleString("es-ES", {
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
          timestampMs,
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

    console.log(`✔ Candles Bitunix guardades a candles2: ${symbol} ${timeframe}`);

  } catch (err) {
    console.log("❌ Error descarregant vela Bitunix:", symbol, timeframe, err.message);
  }
}
