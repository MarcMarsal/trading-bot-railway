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

export async function fetchAndStoreCandles(symbol, interval) {
  try {
    const url = `${process.env.API_URL}?instId=${symbol}&bar=${interval}&limit=1`;

    const response = await axios.get(url);
    const data = response.data.data;

    if (!data || data.length === 0) {
      console.log(`No candles for ${symbol} ${interval}`);
      return;
    }

    const c = data[0];

    const rawTs =
      normalizeTimestamp(c.ts) ??
      normalizeTimestamp(c.t) ??
      normalizeTimestamp(c.time) ??
      normalizeTimestamp(c.openTime) ??
      normalizeTimestamp(c.closeTime) ??
      Date.now();

    const timestamp = Math.floor(rawTs / 1000);

    const candle = {
      symbol,
      interval,
      timestamp,
      open: Number(c.o),
      high: Number(c.h),
      low: Number(c.l),
      close: Number(c.c),
      volume: Number(c.v)
    };

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

    console.log(`Stored candle ${symbol} ${interval} @ ${timestamp}`);

  } catch (err) {
    console.error("Error fetching candles:", err.message);
  }
}
