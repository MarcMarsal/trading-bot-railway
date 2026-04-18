import { detectMSES } from "./patterns.js";

// 1. Enganxa aquí les 72 veles convertides a objectes JS
  // Exemple:
  // { open:1.02, high:1.0216, low:1.0093, close:1.0137, volume:269893.3, timestamp:1776448800000 },
  // ...

  const candles = [
{ open:1.0005, high:1.0042, low:1.0000, close:1.0042, volume:85184.66, timestamp:1776495600000 },
{ open:1.0046, high:1.0046, low:0.9986, close:1.0006, volume:152028.92, timestamp:1776492000000 },
{ open:0.9999, high:1.0045, low:0.9993, close:1.0045, volume:186211.16, timestamp:1776488400000 },
{ open:0.9974, high:1.0016, low:0.9951, close:1.0001, volume:186201.98, timestamp:1776484800000 },
{ open:0.9974, high:1.0016, low:0.9941, close:0.9973, volume:295022.97, timestamp:1776481200000 },
{ open:0.9948, high:1.0000, low:0.9911, close:0.9981, volume:141092.78, timestamp:1776477600000 },
{ open:0.9961, high:1.0011, low:0.9914, close:0.9948, volume:168088.28, timestamp:1776474000000 },
{ open:0.9968, high:1.0022, low:0.9925, close:0.9954, volume:635843.25, timestamp:1776470400000 },
{ open:1.0093, high:1.0093, low:0.9955, close:0.9969, volume:500353.25, timestamp:1776466800000 },
{ open:1.0120, high:1.0147, low:1.0091, close:1.0097, volume:189993.05, timestamp:1776463200000 },
{ open:1.0124, high:1.0177, low:1.0070, close:1.0120, volume:169614.17, timestamp:1776459600000 },
{ open:1.0140, high:1.0177, low:1.0069, close:1.0123, volume:179148.40, timestamp:1776456000000 },
{ open:1.0139, high:1.0188, low:1.0102, close:1.0140, volume:182101.78, timestamp:1776452400000 },
{ open:1.0200, high:1.0216, low:1.0093, close:1.0137, volume:269893.30, timestamp:1776448800000 },
{ open:1.0347, high:1.0349, low:1.0131, close:1.0200, volume:627693.56, timestamp:1776445200000 },
{ open:1.0250, high:1.0347, low:1.0219, close:1.0344, volume:764169.60, timestamp:1776441600000 },
{ open:1.0358, high:1.0366, low:1.0182, close:1.0249, volume:741294.90, timestamp:1776438000000 },
{ open:1.0378, high:1.0420, low:1.0301, close:1.0356, volume:820729.44, timestamp:1776434400000 },
{ open:1.0103, high:1.0433, low:1.0057, close:1.0377, volume:1932922.10, timestamp:1776430800000 },
{ open:1.0005, high:1.0120, low:0.9963, close:1.0105, volume:1435679.20, timestamp:1776427200000 },
{ open:0.9875, high:1.0015, low:0.9873, close:1.0004, volume:342741.10, timestamp:1776423600000 },
{ open:0.9995, high:1.0020, low:0.9831, close:0.9876, volume:582544.56, timestamp:1776420000000 },
{ open:0.9992, high:1.0058, low:0.9938, close:0.9995, volume:1058250.80, timestamp:1776416400000 },
{ open:0.9929, high:1.0028, low:0.9923, close:0.9992, volume:619682.70, timestamp:1776412800000 },
{ open:0.9826, high:0.9946, low:0.9826, close:0.9927, volume:630234.56, timestamp:1776409200000 },
{ open:0.9760, high:0.9847, low:0.9751, close:0.9827, volume:295635.44, timestamp:1776405600000 },
{ open:0.9875, high:0.9877, low:0.9741, close:0.9761, volume:436555.10, timestamp:1776402000000 },
{ open:0.9885, high:0.9917, low:0.9863, close:0.9875, volume:194137.38, timestamp:1776398400000 },
{ open:0.9871, high:0.9921, low:0.9834, close:0.9885, volume:355930.62, timestamp:1776394800000 },
{ open:0.9925, high:0.9949, low:0.9820, close:0.9873, volume:411060.56, timestamp:1776391200000 },
{ open:1.0017, high:1.0060, low:0.9895, close:0.9925, volume:448081.20, timestamp:1776387600000 },
{ open:1.0003, high:1.0047, low:0.9958, close:1.0018, volume:827115.94, timestamp:1776384000000 },
{ open:1.0044, high:1.0099, low:0.9994, close:1.0004, volume:478269.88, timestamp:1776380400000 },
{ open:0.9986, high:1.0139, low:0.9984, close:1.0043, volume:1335250.10, timestamp:1776376800000 },
{ open:0.9917, high:1.0001, low:0.9859, close:0.9988, volume:551687.94, timestamp:1776373200000 },
{ open:1.0035, high:1.0070, low:0.9841, close:0.9917, volume:1018766.94, timestamp:1776369600000 },
{ open:0.9960, high:1.0049, low:0.9911, close:1.0035, volume:830226.06, timestamp:1776366000000 },
{ open:0.9783, high:1.0016, low:0.9754, close:0.9957, volume:948844.75, timestamp:1776362400000 },
{ open:0.9746, high:0.9805, low:0.9709, close:0.9782, volume:346503.62, timestamp:1776358800000 },
{ open:0.9857, high:0.9924, low:0.9705, close:0.9744, volume:614109.25, timestamp:1776355200000 },
{ open:0.9666, high:0.9881, low:0.9656, close:0.9856, volume:854246.90, timestamp:1776351600000 },
{ open:0.9683, high:0.9704, low:0.9525, close:0.9667, volume:1071666.90, timestamp:1776348000000 },
{ open:0.9771, high:0.9948, low:0.9587, close:0.9686, volume:1153420.60, timestamp:1776344400000 },
{ open:0.9698, high:0.9791, low:0.9698, close:0.9772, volume:327753.06, timestamp:1776340800000 },
{ open:0.9678, high:0.9716, low:0.9651, close:0.9698, volume:228385.25, timestamp:1776337200000 },
{ open:0.9726, high:0.9747, low:0.9639, close:0.9675, volume:588096.80, timestamp:1776333600000 },
{ open:0.9724, high:0.9845, low:0.9700, close:0.9730, volume:608769.20, timestamp:1776330000000 },
{ open:0.9709, high:0.9797, low:0.9679, close:0.9722, volume:783749.06, timestamp:1776326400000 },
{ open:0.9824, high:0.9905, low:0.9675, close:0.9712, volume:1236698.00, timestamp:1776322800000 },
{ open:0.9714, high:0.9830, low:0.9701, close:0.9824, volume:390725.50, timestamp:1776319200000 },
{ open:0.9704, high:0.9729, low:0.9628, close:0.9712, volume:849536.00, timestamp:1776315600000 },
{ open:0.9748, high:0.9808, low:0.9690, close:0.9702, volume:501204.53, timestamp:1776312000000 },
{ open:0.9680, high:0.9778, low:0.9672, close:0.9749, volume:451677.94, timestamp:1776308400000 },
{ open:0.9592, high:0.9724, low:0.9590, close:0.9681, volume:464101.84, timestamp:1776304800000 },
{ open:0.9594, high:0.9606, low:0.9535, close:0.9592, volume:251034.60, timestamp:1776301200000 },
{ open:0.9589, high:0.9610, low:0.9550, close:0.9595, volume:157818.98, timestamp:1776297600000 },
{ open:0.9642, high:0.9642, low:0.9554, close:0.9588, volume:353577.16, timestamp:1776294000000 },
{ open:0.9687, high:0.9737, low:0.9640, close:0.9649, volume:363909.30, timestamp:1776290400000 },
{ open:0.9653, high:0.9711, low:0.9601, close:0.9686, volume:143314.38, timestamp:1776286800000 },
{ open:0.9680, high:0.9690, low:0.9615, close:0.9654, volume:227629.23, timestamp:1776283200000 },
{ open:0.9593, high:0.9740, low:0.9574, close:0.9681, volume:547130.60, timestamp:1776279600000 },
{ open:0.9526, high:0.9596, low:0.9513, close:0.9594, volume:196178.22, timestamp:1776276000000 },
{ open:0.9516, high:0.9565, low:0.9492, close:0.9528, volume:244804.90, timestamp:1776272400000 },
{ open:0.9467, high:0.9537, low:0.9447, close:0.9515, volume:354256.56, timestamp:1776268800000 },
{ open:0.9534, high:0.9546, low:0.9413, close:0.9467, volume:289636.16, timestamp:1776265200000 },
{ open:0.9471, high:0.9541, low:0.9454, close:0.9529, volume:185998.17, timestamp:1776261600000 },
{ open:0.9508, high:0.9525, low:0.9430, close:0.9469, volume:302065.25, timestamp:1776258000000 },
{ open:0.9452, high:0.9533, low:0.9425, close:0.9509, volume:221955.77, timestamp:1776254400000 },
{ open:0.9385, high:0.9488, low:0.9379, close:0.9452, volume:279007.60, timestamp:1776250800000 },
{ open:0.9369, high:0.9423, low:0.9323, close:0.9384, volume:311461.60, timestamp:1776247200000 },
{ open:0.9390, high:0.9405, low:0.9350, close:0.9372, volume:127922.28, timestamp:1776243600000 },
{ open:0.9291, high:0.9395, low:0.9280, close:0.9388, volume:256489.73, timestamp:1776240000000 }
];



// 2. Configuració
const symbol = "SUI-USDT";
const timeframe = "1H";

async function run() {
  let state = {};
  console.log("Inici test...")
  for (let i = 0; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);

    const { signal, state: newState } = await detectMSES(
      slice,
      symbol,
      timeframe,
      state
    );

    state = newState;

    if (signal) {
      console.log(
        "SIGNAL:",
        signal.type,
        "at",
        new Date(signal.timestamp).toISOString(),
        "reason:",
        signal.reason
      );
    }
  }
  console.log("Fi test...")
}

run();

