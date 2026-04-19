console.log(">>> TEST.JS EXECUTANT-SE <<<");


import { detectMSES_test as detectMSES } from "./detectMSES_test.js";

let candles = [
  { symbol:"OP-USDT", timeframe:"1H", open:0.1315, high:0.1318, low:0.1303, close:0.1315, volume:348797.44, timestamp:1776416400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1313, high:0.1317, low:0.1294, close:0.1302, volume:274817.38, timestamp:1776420000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1303, high:0.1325, low:0.1302, close:0.1313, volume:668023.94, timestamp:1776423600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1315, high:0.1327, low:0.1308, close:0.1323, volume:955768.94, timestamp:1776427200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1324, high:0.1354, low:0.1316, close:0.1353, volume:1347802.2, timestamp:1776430800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1352, high:0.1374, low:0.1344, close:0.1348, volume:1631123.4, timestamp:1776434400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1348, high:0.1348, low:0.1325, close:0.1334, volume:1022757.0, timestamp:1776438000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1335, high:0.1346, low:0.1327, close:0.134, volume:1009868.3, timestamp:1776441600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1341, high:0.1348, low:0.1329, close:0.1331, volume:717367.44, timestamp:1776445200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1332, high:0.1338, low:0.1323, close:0.1334, volume:164505.38, timestamp:1776448800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1334, high:0.1348, low:0.1329, close:0.1346, volume:136758.6, timestamp:1776452400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1346, high:0.1351, low:0.1337, close:0.1341, volume:165161.02, timestamp:1776456000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1341, high:0.1354, low:0.1337, close:0.134, volume:408619.66, timestamp:1776459600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1338, high:0.1347, low:0.1337, close:0.1346, volume:140708.06, timestamp:1776463200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1346, high:0.1349, low:0.1332, close:0.1343, volume:316915.56, timestamp:1776466800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1344, high:0.1351, low:0.1326, close:0.1337, volume:685586.25, timestamp:1776470400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1338, high:0.135, low:0.1318, close:0.1319, volume:236873.94, timestamp:1776474000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1319, high:0.133, low:0.1314, close:0.1329, volume:271317.66, timestamp:1776477600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1327, high:0.1327, low:0.1315, close:0.1319, volume:228407.48, timestamp:1776481200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1318, high:0.1324, low:0.1313, close:0.1316, volume:380511.28, timestamp:1776484800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1315, high:0.1331, low:0.1315, close:0.1331, volume:202486.84, timestamp:1776488400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1332, high:0.1345, low:0.1325, close:0.1338, volume:139320.52, timestamp:1776492000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1337, high:0.1344, low:0.1334, close:0.1339, volume:197867.77, timestamp:1776495600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1339, high:0.1343, low:0.1308, close:0.1317, volume:957173.4, timestamp:1776499200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1316, high:0.1323, low:0.1301, close:0.1308, volume:983605.06, timestamp:1776502800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1307, high:0.1309, low:0.1289, close:0.1292, volume:499959.28, timestamp:1776506400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1292, high:0.1292, low:0.1277, close:0.1289, volume:92902.586, timestamp:1776510000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1286, high:0.129, low:0.1278, close:0.129, volume:500822.5, timestamp:1776513600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1291, high:0.1292, low:0.1271, close:0.1285, volume:624255.94, timestamp:1776517200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1284, high:0.1289, low:0.1276, close:0.1287, volume:72604.15, timestamp:1776520800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1285, high:0.1289, low:0.1279, close:0.1282, volume:32342.398, timestamp:1776524400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1282, high:0.129, low:0.1275, close:0.1277, volume:297427.16, timestamp:1776528000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1277, high:0.1283, low:0.1271, close:0.1282, volume:56353.883, timestamp:1776531600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.128, high:0.128, low:0.1262, close:0.1263, volume:199166.1, timestamp:1776535200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1263, high:0.1271, low:0.1262, close:0.1266, volume:208857.77, timestamp:1776538800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1264, high:0.1267, low:0.1258, close:0.1265, volume:242369.98, timestamp:1776542400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1264, high:0.127, low:0.1261, close:0.1267, volume:467982.44, timestamp:1776546000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1268, high:0.1269, low:0.1262, close:0.1267, volume:124922.125, timestamp:1776549600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1266, high:0.1269, low:0.1258, close:0.1259, volume:119662.27, timestamp:1776553200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.126, high:0.126, low:0.1242, close:0.125, volume:386150.34, timestamp:1776556800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1253, high:0.1258, low:0.1233, close:0.1243, volume:123946.76, timestamp:1776560400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1242, high:0.1242, low:0.1224, close:0.1234, volume:235802.14, timestamp:1776564000000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1234, high:0.1244, low:0.1228, close:0.1236, volume:507880.38, timestamp:1776567600000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1236, high:0.1244, low:0.123, close:0.1238, volume:194682.2, timestamp:1776571200000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1237, high:0.1246, low:0.1232, close:0.1232, volume:115879.46, timestamp:1776574800000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1233, high:0.1238, low:0.1227, close:0.1237, volume:131755.48, timestamp:1776578400000 },
  { symbol:"OP-USDT", timeframe:"1H", open:0.1237, high:0.1239, low:0.1235, close:0.1235, volume:5127.7275, timestamp:1776582000000 }
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
