// scalping/bot-scalping.js
import { client, initDB } from "../db/client.js";
import pairs from "./core-sc/pairs-sc.js";
import { runScalping } from "./core-sc/runner-sc.js";

console.log("🚀 Bot de Scalping iniciant...");

// Connectar a PostgreSQL
await initDB();

// Bucle principal
async function loop() {
  console.log("⏳ Executant loop de scalping...");

  for (const symbol of pairs) {
    try {
      await runScalping(client, symbol);
    } catch (err) {
      console.log("❌ Error en runScalping:", symbol, err.message);
    }
  }
}

// Executar cada 60 segons
setInterval(loop, 60 * 1000);

// Executar immediatament en arrencar
loop();
