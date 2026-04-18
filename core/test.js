console.log(">>> TEST.JS EXECUTANT-SE <<<");


import { detectMSES_test as detectMSES } from "./detectMSES_test.js";

let candles = [
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9726, high:0.9747, low:0.9639, close:0.9675, volume:588096.8, timestamp:1776333600000, timestamp_es:1776340800000, date_es:"16/04/2026 12:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9678, high:0.9716, low:0.9651, close:0.9698, volume:228385.25, timestamp:1776337200000, timestamp_es:1776344400000, date_es:"16/04/2026 13:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9698, high:0.9791, low:0.9698, close:0.9772, volume:327753.06, timestamp:1776340800000, timestamp_es:1776348000000, date_es:"16/04/2026 14:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9771, high:0.9948, low:0.9587, close:0.9686, volume:1153420.6, timestamp:1776344400000, timestamp_es:1776351600000, date_es:"16/04/2026 15:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9683, high:0.9704, low:0.9525, close:0.9667, volume:1071666.9, timestamp:1776348000000, timestamp_es:1776355200000, date_es:"16/04/2026 16:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9666, high:0.9881, low:0.9656, close:0.9856, volume:854246.9, timestamp:1776351600000, timestamp_es:1776358800000, date_es:"16/04/2026 17:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9857, high:0.9924, low:0.9705, close:0.9744, volume:614109.25, timestamp:1776355200000, timestamp_es:1776362400000, date_es:"16/04/2026 18:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9746, high:0.9805, low:0.9709, close:0.9782, volume:346503.62, timestamp:1776358800000, timestamp_es:1776366000000, date_es:"16/04/2026 19:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9783, high:1.0016, low:0.9754, close:0.9957, volume:948844.75, timestamp:1776362400000, timestamp_es:1776369600000, date_es:"16/04/2026 20:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.996, high:1.0049, low:0.9911, close:1.0035, volume:830226.06, timestamp:1776366000000, timestamp_es:1776373200000, date_es:"16/04/2026 21:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0035, high:1.007, low:0.9841, close:0.9917, volume:1018766.94, timestamp:1776369600000, timestamp_es:1776376800000, date_es:"16/04/2026 22:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9917, high:1.0001, low:0.9859, close:0.9988, volume:551687.94, timestamp:1776373200000, timestamp_es:1776380400000, date_es:"16/04/2026 23:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9986, high:1.0139, low:0.9984, close:1.0043, volume:1335250.1, timestamp:1776376800000, timestamp_es:1776384000000, date_es:"17/04/2026 00:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0044, high:1.0099, low:0.9994, close:1.0004, volume:478269.88, timestamp:1776380400000, timestamp_es:1776387600000, date_es:"17/04/2026 01:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0003, high:1.0047, low:0.9958, close:1.0018, volume:827115.94, timestamp:1776384000000, timestamp_es:1776391200000, date_es:"17/04/2026 02:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0017, high:1.006, low:0.9895, close:0.9925, volume:448081.2, timestamp:1776387600000, timestamp_es:1776394800000, date_es:"17/04/2026 03:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9925, high:0.9949, low:0.982, close:0.9873, volume:411060.56, timestamp:1776391200000, timestamp_es:1776398400000, date_es:"17/04/2026 04:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9871, high:0.9921, low:0.9834, close:0.9885, volume:355930.62, timestamp:1776394800000, timestamp_es:1776402000000, date_es:"17/04/2026 05:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9885, high:0.9917, low:0.9863, close:0.9875, volume:194137.38, timestamp:1776398400000, timestamp_es:1776405600000, date_es:"17/04/2026 06:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9875, high:0.9877, low:0.9741, close:0.9761, volume:436555.1, timestamp:1776402000000, timestamp_es:1776409200000, date_es:"17/04/2026 07:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.976, high:0.9847, low:0.9751, close:0.9827, volume:295635.44, timestamp:1776405600000, timestamp_es:1776412800000, date_es:"17/04/2026 08:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9826, high:0.9946, low:0.9826, close:0.9927, volume:630234.56, timestamp:1776409200000, timestamp_es:1776416400000, date_es:"17/04/2026 09:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9929, high:1.0028, low:0.9923, close:0.9992, volume:619682.7, timestamp:1776412800000, timestamp_es:1776420000000, date_es:"17/04/2026 10:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9992, high:1.0058, low:0.9938, close:0.9995, volume:1058250.8, timestamp:1776416400000, timestamp_es:1776423600000, date_es:"17/04/2026 11:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9995, high:1.002, low:0.9831, close:0.9876, volume:582544.56, timestamp:1776420000000, timestamp_es:1776427200000, date_es:"17/04/2026 12:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9875, high:1.0015, low:0.9873, close:1.0004, volume:342741.1, timestamp:1776423600000, timestamp_es:1776430800000, date_es:"17/04/2026 13:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0005, high:1.012, low:0.9963, close:1.0105, volume:1435679.2, timestamp:1776427200000, timestamp_es:1776434400000, date_es:"17/04/2026 14:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0103, high:1.0433, low:1.0057, close:1.0377, volume:1932922.1, timestamp:1776430800000, timestamp_es:1776438000000, date_es:"17/04/2026 15:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0378, high:1.042, low:1.0301, close:1.0356, volume:820729.44, timestamp:1776434400000, timestamp_es:1776441600000, date_es:"17/04/2026 16:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0358, high:1.0366, low:1.0182, close:1.0249, volume:741294.9, timestamp:1776438000000, timestamp_es:1776445200000, date_es:"17/04/2026 17:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.025, high:1.0347, low:1.0219, close:1.0344, volume:764169.6, timestamp:1776441600000, timestamp_es:1776448800000, date_es:"17/04/2026 18:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0347, high:1.0349, low:1.0131, close:1.02, volume:627693.56, timestamp:1776445200000, timestamp_es:1776452400000, date_es:"17/04/2026 19:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.02, high:1.0216, low:1.0093, close:1.0137, volume:269893.3, timestamp:1776448800000, timestamp_es:1776456000000, date_es:"17/04/2026 20:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0139, high:1.0188, low:1.0102, close:1.014, volume:182101.78, timestamp:1776452400000, timestamp_es:1776459600000, date_es:"17/04/2026 21:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.014, high:1.0177, low:1.0069, close:1.0123, volume:179148.4, timestamp:1776456000000, timestamp_es:1776463200000, date_es:"17/04/2026 22:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0124, high:1.0177, low:1.007, close:1.012, volume:169614.17, timestamp:1776459600000, timestamp_es:1776466800000, date_es:"17/04/2026 23:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.012, high:1.0147, low:1.0091, close:1.0097, volume:189993.05, timestamp:1776463200000, timestamp_es:1776470400000, date_es:"18/04/2026 00:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0093, high:1.0093, low:0.9955, close:0.9969, volume:500353.25, timestamp:1776466800000, timestamp_es:1776474000000, date_es:"18/04/2026 01:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9968, high:1.0022, low:0.9925, close:0.9954, volume:635843.25, timestamp:1776470400000, timestamp_es:1776477600000, date_es:"18/04/2026 02:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9961, high:1.0011, low:0.9914, close:0.9948, volume:168088.28, timestamp:1776474000000, timestamp_es:1776481200000, date_es:"18/04/2026 03:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9948, high:1.0, low:0.9911, close:0.9981, volume:141092.78, timestamp:1776477600000, timestamp_es:1776484800000, date_es:"18/04/2026 04:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9974, high:1.0016, low:0.9941, close:0.9973, volume:295022.97, timestamp:1776481200000, timestamp_es:1776488400000, date_es:"18/04/2026 05:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9974, high:1.0016, low:0.9951, close:1.0001, volume:186201.98, timestamp:1776484800000, timestamp_es:1776492000000, date_es:"18/04/2026 06:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9999, high:1.0045, low:0.9993, close:1.0045, volume:186211.16, timestamp:1776488400000, timestamp_es:1776495600000, date_es:"18/04/2026 07:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0046, high:1.0046, low:0.9986, close:1.0006, volume:152028.92, timestamp:1776492000000, timestamp_es:1776499200000, date_es:"18/04/2026 08:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0005, high:1.0097, low:1.0, close:1.0053, volume:280691.12, timestamp:1776495600000, timestamp_es:1776502800000, date_es:"18/04/2026 09:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:1.0054, high:1.0067, low:0.9839, close:0.9903, volume:998171.7, timestamp:1776499200000, timestamp_es:1776506400000, date_es:"18/04/2026 10:00" },
  { symbol:"SUI-USDT", timeframe:"1H", open:0.9902, high:0.9911, low:0.9868, close:0.9876, volume:28975.865, timestamp:1776502800000, timestamp_es:1776510000000, date_es:"18/04/2026 11:00" }
];

// Ordenem per timestamp
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
