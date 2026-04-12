import { client, initDB } from "./db/client.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";
import { detectMSES } from "./core/patterns.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { alreadySent2 } from "./db/alreadySent2.js";

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAME = "1H";

async function getAllCandles(symbol, timeframe) {
  const q = `
    SELECT symbol, timeframe, open, high, low, close, volume, timestamp
    FROM candles
    WHERE symbol = $1 AND timeframe = $2
    ORDER BY timestamp ASC
  `;
  const res = await client.query(q, [symbol, timeframe]);
  return res.rows;
}

async function processSymbol(symbol) {
  console.log("Processant", symbol);

  const candles = await getAllCandles(symbol, TIMEFRAME);
  if (candles.length < 60) return;

  for (let i = 60; i < candles.length; i++) {
    const window = candles.slice(i - 60, i + 1);
    const last = window[window.length - 1];

    // MICROIMPULSOS
    const micro = detectMicroimpulse(window, symbol, TIMEFRAME);
    if (micro) {
      const exists = await alreadySent2(
        symbol,
        TIMEFRAME,
        micro.type,
        micro.entry,
        micro.timestamp,
        "confirmed"
      );

      if (!exists) {
        await saveSignal2({
          symbol,
          timeframe: TIMEFRAME,
          type: micro.type,
          entry: micro.entry,
          timestamp: micro.timestamp,
          reason: micro.reason,
          sensitivity: micro.sensitivity,
          status: "confirmed",
        });
      }
    }

    // MSES
    const mses = detectMSES(window, symbol, TIMEFRAME);
    if (mses) {
      const exists = await alreadySent2(
        symbol,
        TIMEFRAME,
        mses.type,
        mses.entry,
        mses.timestamp,
        "mses"
      );

      if (!exists) {
        await saveSignal2({
          symbol,
          timeframe: TIMEFRAME,
          type: mses.type,
          entry: mses.entry,
          timestamp: mses.timestamp,
          reason: mses.reason,
          sensitivity: 50,
          status: "mses",
        });
      }
    }
  }
}

async function main() {
  await initDB();
  console.log("Afegint senyals que falten...");

  for (const symbol of SYMBOLS) {
    await processSymbol(symbol);
  }

  console.log("✔ Backfill complet — totes les senyals afegides!");
  process.exit(0);
}

main();
