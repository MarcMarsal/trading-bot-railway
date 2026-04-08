// retracement-sc.js (ESM)
// Valida si una vela és un retracement petit dins la tendència

export function isSmallRetrace({ dirLong, candle, emaFast, distPctMax }) {
    const close = candle.close;
    const emaVal = emaFast[emaFast.length - 1];

    const distPct = Math.abs((close - emaVal) / emaVal) * 100;

    // Si està massa lluny de l'EMA → no és retracement
    if (distPct > distPctMax) return false;

    // Retracement LONG
    if (dirLong && close >= emaVal) return true;

    // Retracement SHORT
    if (!dirLong && close <= emaVal) return true;

    return false;
}
