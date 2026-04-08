// logic-sc.js (ESM)
// Lògica completa del patró (clon exacte del TradingView)

import { getTrendImmediate } from './trend-sc.js';
import { isSmallRetrace } from './retracement-sc.js';
import { getRetracementLevels } from './breakout-sc.js';

export function detectMicroImpulse(candles, emaFast, params) {
    if (candles.length < 3) return null;

    // Tendència immediata
    const { trendUp, trendDown } = getTrendImmediate(candles);
    const dirLong = trendUp;

    // Candles per validar retracement
    const c1 = candles[candles.length - 2];
    const c2 = candles[candles.length - 3];

    // Validació de retracement
    const r1 = isSmallRetrace({
        dirLong,
        candle: c1,
        emaFast,
        distPctMax: params.distPctMax
    });

    const r2 = isSmallRetrace({
        dirLong,
        candle: c2,
        emaFast,
        distPctMax: params.distPctMax
    });

    const retrace = r1 || r2;
    if (!retrace) return null;

    // Nivells de breakout
    const { retraceHigh, retraceLow } = getRetracementLevels(c1, c2);
    const last = candles[candles.length - 1];

    // Microimpulsos
    const microLong = trendUp && last.close > retraceHigh;
    const microShort = trendDown && last.close < retraceLow;

    if (!microLong && !microShort) return null;

    // Senyal LONG
    if (microLong) {
        const entry = last.close;
        return {
            side: 'LONG',
            entry,
            tp: entry * (1 + params.tpPct / 100),
            sl: retraceLow
        };
    }

    // Senyal SHORT
    if (microShort) {
        const entry = last.close;
        return {
            side: 'SHORT',
            entry,
            tp: entry * (1 - params.tpPct / 100),
            sl: retraceHigh
        };
    }

    return null;
}
