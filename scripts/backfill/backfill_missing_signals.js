// backfill_signals2_1h.js

import { client, initDB } from "../../db/client.js";
import { detectMicroimpulse } from "../../core/microimpulse2.js";
import { detectMSES } from "../../core/patterns.js";
import { saveSignal2 } from "../../db/saveSignal2.js";
import { alreadySent2 } from "../../db/alreadySent2.js";

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
  if (candles.length < 60) {
    console.log("Pocs candles per", symbol, "- n =", candles.length);
    return;
  }

  // Estat per simular msCond[1], microLong[1], etc.
  let microState = {};
  let msesState = {};

  // Recorrem amb finestra mòbil de 61 veles (com fas ara)
  for (let i = 60; i < candles.length; i++) {
    const window = candles.slice(i - 60, i + 1);
    // Ens assegurem que la finestra està ordenada
    window.sort((a, b) => a.timestamp - b.timestamp);

    const last = window[window.length - 1];

    // -------------------------
    // MICROIMPULSOS
    // -------------------------
    const microResult = detectMicroimpulse(
      window,
      symbol,
      TIMEFRAME,
      microState
    );

    const microSignal = microResult?.signal || null;
    microState = microResult?.state || microState;

    if (microSignal) {
      const exists = await alreadySent2(
        symbol,
        TIMEFRAME,
        microSignal.type,
        microSignal.entry,
        microSignal.timestamp,
        "confirmed"
      );

      if (!exists) {
        console.log(
          "[MICRO]",
          symbol,
          TIMEFRAME,
          microSignal.type,
          "ts:",
          microSignal.timestamp
        );

        await saveSignal2({
          symbol,
          timeframe: TIMEFRAME,
          type: microSignal.type,
          entry: microSignal.entry,
          timestamp: microSignal.timestamp,
          reason: microSignal.reason,
          sensitivity: microSignal.sensitivity,
          status: "confirmed",
        });
      }
    }

    // -------------------------
    // MS / ES
    // -------------------------
    const msesResult = detectMSES(
      window,
      symbol,
      TIMEFRAME,
      msesState
    );

    const msesSignal = msesResult?.signal || null;
    msesState = msesResult?.state || msesState;

    if (msesSignal) {
      const exists = await alreadySent2(
        symbol,
        TIMEFRAME,
        msesSignal.type,
        msesSignal.entry,
        msesSignal.timestamp,
        "mses"
      );

      if (!exists) {
        console.log(
          "[MSES]",
          symbol,
          TIMEFRAME,
          msesSignal.type,
          "ts:",
          msesSignal.timestamp
        );

        await saveSignal2({
          symbol,
          timeframe: TIMEFRAME,
          type: msesSignal.type,
          entry: msesSignal.entry,
          timestamp: msesSignal.timestamp,
          reason: msesSignal.reason,
          sensitivity: 50,
          status: "mses",
        });
      }
    }
  }

  console.log("✔ Fet", symbol);
}

async function main() {
  await initDB();
  console.log("Afegint senyals que falten (backfill 1H)...");

  for (const symbol of SYMBOLS) {
    await processSymbol(symbol);
  }

  console.log("✔ Backfill complet — totes les senyals afegides!");
  process.exit(0);
}

main();
