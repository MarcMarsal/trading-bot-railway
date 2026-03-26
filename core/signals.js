// -------------------------------------------------------------
// DETECTAR EARLY SIGNAL (vela 3 encara oberta)
// -------------------------------------------------------------
function detectEarlySignal(candles) {
  if (candles.length < 3) return null;

  const v1 = candles[candles.length - 3];
  const v2 = candles[candles.length - 2];
  const v3 = candles[candles.length - 1]; // encara oberta

  // Early MS (possible moviment alcista)
  const isEarlyMS =
    v1.low > v2.low &&        // v2 fa un mínim més baix
    v3.close > v2.high;       // v3 trenca el màxim de v2

  // Early ES (possible moviment baixista)
  const isEarlyES =
    v1.high < v2.high &&      // v2 fa un màxim més alt
    v3.close < v2.low;        // v3 trenca el mínim de v2

  if (isEarlyMS) {
    return {
      tipo: "MS",
      v1,
      v2,
      v3,
      entry: v3.close
    };
  }

  if (isEarlyES) {
    return {
      tipo: "ES",
      v1,
      v2,
      v3,
      entry: v3.close
    };
  }

  return null;
}

// -------------------------------------------------------------
// DETECTAR SENYAL NORMAL (vela 3 tancada)
// -------------------------------------------------------------
function classifySignal(candles) {
  if (candles.length < 3) return null;

  const v1 = candles[candles.length - 3];
  const v2 = candles[candles.length - 2];
  const v3 = candles[candles.length - 1]; // tancada

  // MS normal
  const isMS =
    v1.low > v2.low &&        // v2 fa un mínim més baix
    v3.close > v2.high;       // v3 trenca el màxim de v2

  // ES normal
  const isES =
    v1.high < v2.high &&      // v2 fa un màxim més alt
    v3.close < v2.low;        // v3 trenca el mínim de v2

  if (isMS) {
    return {
      tipoBase: "MS",
      v1,
      v2,
      v3
    };
  }

  if (isES) {
    return {
      tipoBase: "ES",
      v1,
      v2,
      v3
    };
  }

  return null;
}

module.exports = {
  detectEarlySignal,
  classifySignal
};
