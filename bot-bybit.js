// bot-bybit.js

import cron from "node-cron";
import axios from "axios";
import { client, initDB } from "./db/client.js";

// -------------------------------------------------------------
// SYMBOLS I TIMEFRAMES
// -------------------------------------------------------------
const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["1H"];

// -------------------------------------------------------------
// FETCH + STORE CANDLES BYBIT → candles2
// -------------------------------------------------------------
async function fetchAndStoreCandlesBybit(symbol, timeframe) {
  const cleanSymbol = symbol.replace("-", "").toUpperCase();
  const url = "https://bybit-proxy-18mg.onrender.com";

  try {
    const res = await axios.get(url, {
      params: {
        symbol: cleanSymbol,
        interval: "60",
        limit: 200
      },
      timeout: 8000
    });

    if (!res.data?.result?.list) {
      console.log(`❌ Resposta incorrecta per ${symbol}`);
      return;
    }

    const list = res.data.result.list;

    const candles = list.map(c => ({
      timestamp: Number(c[0]),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    })).reverse();

    for (const c of candles) {
      await client.query(
        `
        INSERT INTO candles2
          (symbol, timeframe, open, high, low, close, volume, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING
        `,
        [
          symbol,
          timeframe,
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume,
          c.timestamp
        ]
      );
    }

    console.log(`✔ ${symbol} → ${candles.length} veles guardades`);
  } catch (err) {
    console.log(`❌ Error Bybit ${symbol}:`, err.message);
  }
}

// -------------------------------------------------------------
// LOOP PRINCIPAL (només recollir veles)
// -------------------------------------------------------------
async function mainLoop() {
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandlesBybit(symbol, timeframe);
    }
  }
}

// -------------------------------------------------------------
// START BOT
// -------------------------------------------------------------
async function startBot() {
  await initDB();
  console.log("Bot Bybit en marxa (només recollida de veles)");

  // Cada minut (igual que bot-microimpulsos)
  cron.schedule("* * * * *", mainLoop);
}

startBot();
