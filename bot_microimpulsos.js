// bot_microimpulsos.js

import cron from "node-cron";
import axios from "axios";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";

const API_URL = process.env.API_URL;

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["15m", "30m", "1H", "4H"];

// -------------------------------------------------------------
// VALIDACIÓ TIMESTAMP
// -------------------------------------------------------------
function normalizeTimestamp(raw) {
  if (!raw || typeof raw !== "number") return null;
  if (raw < 1600000000) return null;
  return raw;
}

// -------------------------------------------------------------
// FETCH + STORE (PG, limit=1)
// -------------------------------------------------------------
async function fetchAndStoreCandles(symbol, timeframe) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${timeframe}&limit=1`;
    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return;

    const k = data[0];
    const rawTs = normalizeTimestamp(parseInt(k[0])) ?? Date.now();
    const timestamp = Math.floor(rawTs);

    const open = parseFloat(k[1]);
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);
    const close = parseFloat(k[4]);
    const volume = parseFloat(k[5]);

    const timestamp_es = new Date(
      new Date(timestamp).toLocaleString("en-US", { timeZone: "Europe/Madrid" })
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
      INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume, timestamp_es, date_es)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (symbol, timeframe, timestamp)
      DO UPDATE SET
        open=$4, high=$5, low=$6, close=$7, volume=$8,
        timestamp_es=$9, date_es=$10;
      `,
      [symbol, timeframe, timestamp, open, high, low, close, volume, timestamp_es, date_es]
    );

  } catch (err) {
    console.log("Error descarregant vela:", symbol, timeframe, err.message);
  }
}

// -------------------------------------------------------------
// GET CANDLES FROM DB (PG)
// -------------------------------------------------------------
async function getCandlesFromDB(symbol, timeframe, limit = 120) {
  const res = await client.query(
    `
    SELECT symbol, timeframe, open, high, low, close, volume, timestamp
    FROM candles
    WHERE symbol = $1 AND timeframe = $2
    ORDER BY timestamp DESC
    LIMIT $3
    `,
    [symbol, timeframe, limit]
  );

  return res.rows.reverse();
}

// -------------------------------------------------------------
// MICROIMPULSOS FIAT
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 120);
  if (!candles || candles.length < 60) return;

  const micro = detectMicroimpulse(candles, symbol, timeframe);
  if (!micro) return;

  const tsSec = Math.floor(micro.timestamp / 1000);

  const already = await alreadySent2(symbol, timeframe, micro.type, tsSec);
  if (already) return;

  await saveSignal2({
    symbol,
    timeframe,
    type: micro.type,
    entry: micro.entry,
    timestamp: micro.timestamp,
    reason: "microimpulse",
    sensitivity: micro.sensitivity ?? 40
  });

  console.log(`Microimpuls detectat: ${symbol} ${timeframe} → ${micro.type}`);
}

// -------------------------------------------------------------
// LOOP PRINCIPAL
// -------------------------------------------------------------
async function mainLoop() {
  console.log("Tick microimpulsos:", new Date().toISOString());

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        await processSymbol(symbol, timeframe);
      } catch (err) {
        console.error("Error processant", symbol, timeframe, err.message);
      }
    }
  }
}

// -------------------------------------------------------------
// START BOT
// -------------------------------------------------------------
async function startBot() {
  await initDB();
  console.log("Bot Microimpulsos FIAT en marxa");
  cron.schedule("* * * * *", mainLoop);
}

startBot();
