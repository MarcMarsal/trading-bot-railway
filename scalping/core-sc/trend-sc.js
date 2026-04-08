// trend-sc.js (ESM)
// Detecta tendència immediata segons les últimes veles

export function getTrendImmediate(candles) {
    if (candles.length < 3) {
        return { trendUp: false, trendDown: false };
    }

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    const trendUp = last.close > prev.close;
    const trendDown = last.close < prev.close;

    return { trendUp, trendDown };
}
