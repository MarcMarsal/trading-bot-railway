import { detectMSES_test } from "./detectMSES_test.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Ruta absoluta del directori actual (on està aquest fitxer)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Llegim candles.json des del mateix directori
const raw = fs.readFileSync(path.join(__dirname, "candles.json"), "utf8");
const candles = JSON.parse(raw);

let state = {};

console.log(">>> TEST EXECUTANT-SE <<<");
console.log("Total veles:", candles.length);

for (let i = 0; i < candles.length; i++) {

  // NOMÉS passem les últimes 4 veles (temps real)
  const slice = candles.slice(Math.max(0, i - 3), i + 1);

  const { signal, state: newState } = await detectMSES_test(
    slice,
    "APT-USDT",
    "1H",
    state
  );

  state = newState;

  if (signal) {
    console.log(
      `${String(i + 1).padStart(2, "0")}/${candles.length} | ts=${new Date(
        candles[i].timestamp
      ).toISOString()} | signal=${signal.type}`
    );
  }
}

console.log("******** TEST ACABAT, TOTAL ITERACIONS:", candles.length, "********");
