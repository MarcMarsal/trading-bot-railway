// scalping/bot-scalping.js
import express from "express";
import { client, initDB } from "../db/client.js";
import pairs from "./core-sc/pairs-sc.js";
import { runScalping } from "./core-sc/runner-sc.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🚀 Bot de Scalping iniciant...");

// 🔹 Arrencar Express immediatament (abans de qualsevol await)
const app = express();
const PORT = process.env.PORT || 3000;

global.lastSignals = [];

// Servir panell
app.use(express.static(path.join(__dirname, "../public")));
app.get("/signals", (req, res) => res.json(lastSignals));

app.listen(PORT, () => {
  console.log("🌐 Panell web actiu al port", PORT);
});

// 🔹 Connectar a la base de dades (si falla, no bloqueja Express)
initDB()
  .then(() => console.log("🗄️ DB connectada"))
  .catch(err => console.log("❌ Error DB:", err.message));

// 🔹 Loop principal
async function loop() {
  console.log("⏳ Executant loop de scalping...");

  for (const symbol of pairs) {
    try {
      const signal = await runScalping(client, symbol);

      if (signal) {
        // Evitar duplicats: només afegir si és diferent de l’última
        const last = lastSignals[lastSignals.length - 1];
        const isDuplicate =
          last &&
          last.symbol === symbol &&
          last.direction === signal.direction &&
          Date.now() - last.time < 5000; // 5 segons

        if (!isDuplicate) {
          lastSignals.push({
            symbol,
            time: Date.now(),
            ...signal
          });

          if (lastSignals.length > 30) lastSignals.shift();

          console.log("💾 Senyal guardada:", symbol, signal.direction);
        }
      }

    } catch (err) {
      console.log("❌ Error en runScalping:", symbol, err.message);
    }
  }
}

// 🔹 Executar un cop al principi (evita duplicats)
setTimeout(loop, 2000);

// 🔹 Executar cada 60 segons
setInterval(loop, 60 * 1000);
