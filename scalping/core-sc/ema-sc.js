// ema-sc.js
// Càlcul d'EMA incremental o simple

function ema(values, length) {
    if (values.length < length) return null;
    const k = 2 / (length + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
    }
    return ema;
}

module.exports = { ema };
