console.log(">>> TEST.JS EXECUTANT-SE <<<");


import { detectMSES_test as detectMSES } from "./detectMSES_test.js";

let candles = [
  { timestamp: 1776502800000, open: 0.9722, high: 0.9731, low: 0.9643, close: 0.9666, volume: 49057.684 }, // 11:00
  { timestamp: 1776506400000, open: 0.9665, high: 0.9668, low: 0.9547, close: 0.9557, volume: 59572.69 },  // 12:00
  { timestamp: 1776510000000, open: 0.9557, high: 0.9575, low: 0.9486, close: 0.9517, volume: 86517.06 },  // 13:00
  { timestamp: 1776513600000, open: 0.9516, high: 0.9549, low: 0.9478, close: 0.9527, volume: 33325.508 }, // 14:00
  { timestamp: 1776517200000, open: 0.9525, high: 0.9531, low: 0.9354, close: 0.9485, volume: 90925.5 },   // 15:00
  { timestamp: 1776520800000, open: 0.9482, high: 0.9491, low: 0.9423, close: 0.9464, volume: 68158.23 },  // 16:00
  { timestamp: 1776524400000, open: 0.9458, high: 0.9506, low: 0.9427, close: 0.9443, volume: 57842.473 }, // 17:00
  { timestamp: 1776528000000, open: 0.9441, high: 0.9493, low: 0.9401, close: 0.9442, volume: 97018.49 },  // 18:00
  { timestamp: 1776531600000, open: 0.9439, high: 0.9507, low: 0.941,  close: 0.946,  volume: 62055.816 }, // 19:00
  { timestamp: 1776535200000, open: 0.9458, high: 0.9465, low: 0.9332, close: 0.9361, volume: 108533.55 }, // 20:00
  { timestamp: 1776538800000, open: 0.936,  high: 0.9416, low: 0.9337, close: 0.9379, volume: 44069.555 }, // 21:00
  { timestamp: 1776542400000, open: 0.9379, high: 0.9439, low: 0.9349, close: 0.9413, volume: 51746.633 }, // 22:00
  { timestamp: 1776546000000, open: 0.9415, high: 0.9461, low: 0.9415, close: 0.9461, volume: 15324.801 }, // 23:00
  { timestamp: 1776549600000, open: 0.9461, high: 0.9471, low: 0.9415, close: 0.9426, volume: 33845.844 }, // 00:00
  { timestamp: 1776553200000, open: 0.942,  high: 0.9441, low: 0.9361, close: 0.9361, volume: 76018.74 },  // 01:00
  { timestamp: 1776556800000, open: 0.9355, high: 0.9355, low: 0.9275, close: 0.9324, volume: 87998.86 },  // 02:00
  { timestamp: 1776560400000, open: 0.9335, high: 0.9382, low: 0.9265, close: 0.9275, volume: 136311.47 }, // 03:00
  { timestamp: 1776564000000, open: 0.9273, high: 0.9311, low: 0.9212, close: 0.9271, volume: 112792.37 }, // 04:00
  { timestamp: 1776567600000, open: 0.9262, high: 0.9318, low: 0.9224, close: 0.9264, volume: 41308.6 },   // 05:00
  { timestamp: 1776571200000, open: 0.9266, high: 0.9339, low: 0.9246, close: 0.9309, volume: 21671.408 }, // 06:00
  { timestamp: 1776574800000, open: 0.9307, high: 0.9361, low: 0.9285, close: 0.9285, volume: 65281.008 }, // 07:00
  { timestamp: 1776578400000, open: 0.9289, high: 0.9313, low: 0.9215, close: 0.9297, volume: 103968.37 }, // 08:00
  { timestamp: 1776582000000, open: 0.9294, high: 0.933,  low: 0.923,  close: 0.9312, volume: 73217.1 },   // 09:00
  { timestamp: 1776585600000, open: 0.9308, high: 0.9331, low: 0.9296, close: 0.9313, volume: 50851.918 }  // 10:00
];


// Ordenem per timestamp
candles = candles.sort((a, b) => a.timestamp - b.timestamp);

const symbol = "APT-USDT";
const timeframe = "1H";

async function run() {
  let state = {};

  console.log("Inici test...");
  console.log("Total veles:", candles.length);

  try {
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const slice = candles.slice(0, i + 1);

      let result;
      try {
        result = await detectMSES(slice, symbol, timeframe, state);
      } catch (err) {
        console.error("ERROR dins detectMSES a la iteració", i + 1, err);
        throw err;
      }

      const { signal, state: newState } = result || {};
      state = newState || state;

      // -------------------------
      // LOG ORDENAT (1 línia)
      // -------------------------
      const ts = new Date(c.timestamp).toISOString();
      const sig = signal ? signal.type : "cap";

      console.log(
        `${String(i + 1).padStart(2, "0")}/${candles.length} | ts=${ts} | signal=${sig}`
      );
    }

    console.log("******** TEST ACABAT, TOTAL ITERACIONS:", candles.length, "********");

  } catch (err) {
    console.error("TEST ABORTAT PER ERROR:", err);
  }

  await new Promise(r => setTimeout(r, 3000));
  process.exit(0);
}

run();
