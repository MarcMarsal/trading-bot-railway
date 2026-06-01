// bot-bybit.js

import cron from "node-cron";
import axios from "axios";
import { client, initDB } from "./db/client.js";
import { fetchAndStoreCandlesBybit } from "./core/fetchCandlesBybit.js";

// -------------------------------------------------------------
// SYMBOLS I TIMEFRAMES
// -------------------------------------------------------------
const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "RNDR-USDT", "ASTR-USDT",
  "BCH-USDT", "VIRTUALUSDT"
];


const TIMEFRAMES = ["1H"];



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
