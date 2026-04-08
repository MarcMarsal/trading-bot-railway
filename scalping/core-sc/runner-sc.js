// runner-sc.js
// Llegeix veles, calcula EMA, detecta senyal i la guarda

const { getCandlesSc } = require('./candles-sc');
const { ema } = require('./ema-sc');
const { detectMicroImpulse } = require('./logic-sc');
const { saveSignal } = require('./signals-sc');

async function runScalping(db, symbol) {
    const candles = await getCandlesSc(symbol, '5m', 20);
    if (candles.length < 20) return;

    const closes = candles.map(c => c.close);
    const emaFast = ema(closes, 20);

    const signal = detectMicroImpulse(candles, emaFast, {
        tpPct: 0.25,
        distPctMax: 0.5
    });

    if (signal) {
        await saveSignal(db, { ...signal, symbol, timeframe: '5m' });
    }
}

module.exports = { runScalping };
