// logic-sc.js
// Lògica completa del patró (clon exacte del TradingView)

const { getTrendImmediate } = require('./trend-sc');
const { isSmallRetrace } = require('./retracement-sc');
const { getRetracementLevels } = require('./breakout-sc');

function detectMicroImpulse(candles, emaFast, params) {
    if (candles.length < 3) return null;

    const { trendUp, trendDown } = getTrendImmediate(candles);
    const dirLong = trendUp;

    const c1 = candles[candles.length - 2];
    const c2 = candles[candles.length - 3];

    const r1 = isSmallRetrace({ dirLong, candle: c1, emaFast, distPctMax: params.distPctMax });
    const r2 = isSmallRetrace({ dirLong, candle: c2, emaFast, distPctMax: params.distPctMax });

    const retrace = r1 || r2;
    if (!retrace) return null;

    const { retraceHigh, retraceLow } = getRetracementLevels(c1, c2);
    const last = candles[candles.length - 1];

    const microLong = trendUp && last.close > retraceHigh;
    const microShort = trendDown && last.close < retraceLow;

    if (!microLong && !microShort) return null;

    if (microLong) {
        const entry = last.close;
        return {
            side: 'LONG',
            entry,
            tp: entry * (1 + params.tpPct / 100),
            sl: retraceLow
        };
    }

    if (microShort) {
        const entry = last.close;
        return {
            side: 'SHORT',
            entry,
            tp: entry * (1 - params.tpPct / 100),
            sl: retraceHigh
        };
    }
}

module.exports = { detectMicroImpulse };
