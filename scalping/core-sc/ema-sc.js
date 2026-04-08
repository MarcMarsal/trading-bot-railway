// ema-sc.js (ESM)
// Càlcul d'EMA simple i eficient

export function ema(values, period) {
    if (!values || values.length < period) return [];

    const k = 2 / (period + 1);
    let emaArray = [];

    // Primer valor = mitjana simple
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += values[i];
    }

    let prevEma = sum / period;
    emaArray.push(prevEma);

    // Resta de valors
    for (let i = period; i < values.length; i++) {
        const current = values[i] * k + prevEma * (1 - k);
        emaArray.push(current);
        prevEma = current;
    }

    return emaArray;
}
