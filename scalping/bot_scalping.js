// bot-scalping.js
// Punt d'entrada del bot de scalping

const { runScalping } = require('./scalping/core-sc/runner-sc');
const db = require('../core/db');

async function loop() {
    await runScalping(db, 'BTC-USDT');
}

setInterval(loop, 60 * 1000);
