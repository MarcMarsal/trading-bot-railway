// trend-sc.js
// Tendència immediata real (mateixa lògica que TradingView)

function getTrendImmediate(candles) {
    const c0 = candles[candles.length - 1].close;
    const c1 = candles[candles.length - 2].close;
    const c2 = candles[candles.length - 3].close;

    const trendUp = c0 > c1 && c1 >= c2;
    const trendDown = c0 < c1 && c1 <= c2;

    return {
        trendUp,
        trendDown,
        trendNeutral: !trendUp && !trendDown
    };
}

module.exports = { getTrendImmediate };
