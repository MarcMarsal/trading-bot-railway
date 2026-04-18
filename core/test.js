import { detectMSES } from "./patterns.js";

let candles = [
  // (les teves 72 veles, tal qual)
  { open:1.0005, high:1.0042, low:1.0000, close:1.0042, volume:85184.66, timestamp:1776495600000 },
  { open:1.0046, high:1.0046, low:0.9986, close:1.0006, volume:152028.92, timestamp:1776492000000 },
  { open:0.9999, high:1.0045, low:0.9993, close:1.0045, volume:186211.16, timestamp:1776488400000 },
  { open:0.9974, high:1.0016, low:0.9951, close:1.0001, volume:186201.98, timestamp:1776484800000 },
  { open:0.9974, high:1.0016, low:0.9941, close:0.9973, volume:295022.97, timestamp:1776481200000 },
  { open:0.9948, high:1.0000, low:0.9911, close:0.9981, volume:141092.78, timestamp:1776477600000 },
  { open:0.9961, high:1.0011, low:0.9914, close:0.9948, volume:168088.28, timestamp:1776474000000 },
  { open:0.9968, high:1.0022, low:0.9925, close:0.9954, volume:635843.25, timestamp:1776470400000 },
  { open:1.0093, high:1.0093, low:0.9955, close:0.9969, volume:500353.25, timestamp:1776466800000 },
  // ... resta de veles ...
];

candles = candles.sort((a, b) => a.timestamp - b.timestamp);

const symbol = "SUI-USDT";
const timeframe = "1H";

async function run() {
  let state = {};
  console.log("Inici test...");
  console.log("Total veles:", candles.length);

  try {
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      console.log(`--- ITERACIÓ ${i + 1}/${candles.length} ---`, new Date(c.timestamp).toISOString());

      const slice = candles.slice(0, i + 1);

      let result;
      try {
        result = await detectMSES(slice, symbol, timeframe, state);
      } catch (err) {
        console.error("ERROR dins detectMSES a la iteració", i + 1, err);
        throw err; // sortim per veure-ho clar als logs
      }

      const { signal, state: newState } = result || {};
      state = newState || state;

      if (signal) {
        console.log(
          "SIGNAL:",
          signal.type,
          "at",
          new Date(signal.timestamp).toISOString(),
          "reason:",
          signal.reason
        );
      } else {
        console.log("res a", new Date(c.timestamp).toISOString());
      }
    }

    console.log("Fi test OK, totes les veles processades.");
  } catch (err) {
    console.error("TEST ABORTAT PER ERROR:", err);
  }

  await new Promise(r => setTimeout(r, 3000));
  process.exit(0);
}

run();
