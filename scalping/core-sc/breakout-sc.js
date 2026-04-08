// breakout-sc.js
// Breakout del retracement

function getRetracementLevels(c1, c2) {
    return {
        retraceHigh: Math.max(c1.high, c2.high),
        retraceLow: Math.min(c1.low, c2.low)
    };
}

module.exports = { getRetracementLevels };
