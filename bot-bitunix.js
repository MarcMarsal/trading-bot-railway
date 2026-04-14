import { fetchAndStoreCandles2 } from "./core/fetchCandlesBitunix.js";
import { symbols } from "./config/symbols.js"; // mateix fitxer que OKX
import "./db/client.js";

console.log("Bot Bitunix (fase 1) en marxa — OKX → candles2");

async function loop() {
  for (const s of symbols) {
    await fetchAndStoreCandles2(s, "1H");
  }
}

setInterval(loop, 60 * 1000); // cada minut
loop();
