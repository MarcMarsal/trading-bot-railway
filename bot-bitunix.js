import { fetchAndStoreCandles2 } from "./core/fetchCandlesBitunix.js";
import "./db/client.js";

console.log("Bot Bitunix (fase 1) en marxa — OKX → candles2");

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];


async function loop() {
  for (const s of symbols) {
    await fetchAndStoreCandles2(s, "1H");
  }
}

setInterval(loop, 60 * 1000); // cada minut
loop();
