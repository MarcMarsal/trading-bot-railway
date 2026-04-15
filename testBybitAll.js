// testBybitAll.js

import { initDB } from "./db/client.js";
import { storeCandlesBybit } from "./core/storeCandlesBybit.js";

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

async function test() {
  await initDB();

  console.log("📡 Test Bybit — Inserint 3 veles 1H per cada símbol\n");

  for (const symbol of SYMBOLS) {
    try {
      const candles = await storeCandlesBybit(symbol);

      console.log(`\n=== ${symbol} ===`);
      console.log(candles);
    } catch (err) {
      console.log(`❌ Error amb ${symbol}:`, err.message);
    }
  }

  console.log("\n✔ Test completat");
}

test();
