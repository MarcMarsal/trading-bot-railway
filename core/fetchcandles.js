import axios from "axios";
import prisma from "../db.js";

// Validació robusta del timestamp
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000) return null; // només timestamps reals (2020+)
  return raw;
}

// -------------------------------------------------------------
// FETCH + STORE CANDLES (OPTIMITZAT)
// -------------------------------------------------------------
async function fetchAndStoreCandles(symbol, interval) {
  try {
    // Només 1 candle (o 10 si vols)
    const url = `${API_URL}?instId=${symbol}&bar=${interval}&limit=1`;

    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return;

    const k = data[0];

    // Validació robusta del timestamp
    const rawTs = normalizeTimestamp(parseInt(k[0])) ?? Date.now();
    const timestamp = Math.floor(rawTs / 1000);

    const candle = {
      symbol,
      interval,
      timestamp,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    };

    // Desa a la DB (upsert)
    await prisma.candles.upsert({
      where: {
        symbol_interval_timestamp: {
          symbol,
          interval,
          timestamp
        }
      },
      update: candle,
      create: candle
    });

    console.log(`Stored ${symbol} ${interval} @ ${timestamp}`);

  } catch (err) {
    console.log("Error descarregant vela:", symbol, interval, err.message);
  }
}
