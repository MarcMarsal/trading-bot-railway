function detectPattern(velas) {
  if (velas.length < 4) return { msNow: false, esNow: false };

  const n = velas.length;

  // Veles en ordre TV: v3 (fa 3 veles), v2 (fa 2), v1 (última)
  const v3 = velas[n - 3];
  const v2 = velas[n - 2];
  const v1 = velas[n - 1];

  // Funcions bàsiques
  const bull = (v) => v.close > v.open;
  const bear = (v) => v.close < v.open;

  // Indecisió tolerant (igual que TradingView)
  const indecisionTolerant = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return true; // doji absolut = indecisió
    return (body / range) <= 0.5;
  };

  // Strong bear / strong bull tolerant (bodyPct >= 0.5)
  const strongBear = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return false;
    return (body / range) >= 0.5;
  };

  const strongBull = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return false;
    return (body / range) >= 0.5;
  };

  // Patrons igual que TradingView
  const esNow =
    bull(v3) &&                // V3 = bull (no strong)
    indecisionTolerant(v2) &&  // V2 = indecisió tolerant
    strongBear(v1);            // V1 = strong bear

  const msNow =
    bear(v3) &&                // V3 = bear (no strong)
    indecisionTolerant(v2) &&  // V2 = indecisió tolerant
    strongBull(v1);            // V1 = strong bull

  return { msNow, esNow, v1, v2, v3 };
}
