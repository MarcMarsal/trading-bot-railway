import { client, initDB } from '../core/db/client.js';
import { runScalping } from './core-sc/runner-sc.js';
import pairs from './core-sc/pairs-sc.js';

await initDB(); // ← imprescindible

async function loop() {
  for (const symbol of pairs) {
    await runScalping(client, symbol);
  }
}

setInterval(loop, 60 * 1000);
