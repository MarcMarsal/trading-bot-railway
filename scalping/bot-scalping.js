import express from "express";
import { client, initDB } from "../db/client.js";
import pairs from "./core-sc/pairs-sc.js";
import { runScalping } from "./core-sc/runner-sc.js";

console.log("🚀 Bot de Scalping iniciant...");

// 🔹 Arrencar Express immediatament
const app = express();
const PORT = process.env.PORT || 3000;

global.lastSignals = [];

app.use(express.static("public"));
app.get("/signals", (req, res) => res.json(lastSignals));

app.listen(PORT, () => {
  console.log("🌐 Panell web actiu al port", PORT);
});

// 🔹 Després connectar a la base de dades
await initDB();

// 🔹 Loop principal
async function loop() {
  console.log("⏳ Executant loop de scalping...");
  for (const symbol of pairs) {
    try {
      const signal = await runScalping(client, symbol);
      if (signal) {
        lastSignals.push({ symbol, time: Date.now(), ...signal });
        if (lastSignals.length > 30) lastSignals.shift();
        console.log("💾 Senyal guardada:", symbol, signal.direction);
      }
    } catch (err) {
      console.log("❌ Error en runScalping:", symbol, err.message);
    }
  }
}

setInterval(loop, 60 * 1000);
loop();
