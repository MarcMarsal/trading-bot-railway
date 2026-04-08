// breakout-sc.js (ESM)
// Calcula els nivells de retracement per validar microimpulsos

export function getRetracementLevels(c1, c2) {
    const high = Math.max(c1.high, c2.high);
    const low = Math.min(c1.low, c2.low);

    return {
        retraceHigh: high,
        retraceLow: low
    };
}

