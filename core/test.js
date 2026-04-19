import { detectMSES_test } from "./detectMSES_test.js";
import fs from "fs";

const raw = fs.readFileSync("./candles.json", "utf8");
const candles = JSON.parse(raw);

let state = {};

console.log("Inici test...");
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
