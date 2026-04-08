// retracement-sc.js
// Retracement petit (mateix criteri que TradingView)

function isSmallRetrace({ dirLong, candle, emaFast, distPctMax }) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const bodyPct = range > 0 ? (body / range) * 100 : 100;
    const colorOK = dirLong ? candle.close < candle.open : candle.close > candle.open;
    const mid = (candle.high + candle.low) / 2;
    const distPct = Math.abs((mid - emaFast) / emaFast) * 100;

    return bodyPct < 40 && colorOK && distPct < distPctMax;
}

module.exports = { isSmallRetrace };
