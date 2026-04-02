// bot_microimpulsos.js

import cron from "node-cron";
import { client, initDB } from "./db/client.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";

// IMPORTEM LA FUNCIÓ CORRECTA (sense duplicats)
import { fetchAndStoreCandles } from "./core/fetchcandles.js";

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["15m", "30m", "1H", "4H"];

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

  // JA NO CAL EVITAR INTRAVELA
  // Perquè fetchcandles.js ja desa la vela tancada

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
  // 1) Descarregar i guardar veles (actual + tancada)
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  // 2) Processar microimpulsos
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        await processSymbol(symbol, timeframe);
      } catch (err) {
        console.log("Error processant", symbol, timeframe, err.message);
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
