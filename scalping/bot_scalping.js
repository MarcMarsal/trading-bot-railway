const pairs = require('./core-sc/pairs-sc');
const { runScalping } = require('./core-sc/runner-sc');
const db = require('../core/db');

async function loop() {
    for (const symbol of pairs) {
        await runScalping(db, symbol);
    }
}

setInterval(loop, 60 * 1000);
