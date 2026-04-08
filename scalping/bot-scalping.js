// scalping/bot-scalping.js
import { client, initDB } from "../db/client.js";
import pairs from "./core-sc/pairs-sc.js";
import { runScalping } from "./core-sc/runner-sc.js";
import express from "express";

console.log("🚀 Bot de Scalping iniciant...");

// 🔹 Panell web
const app = express();
const PORT = process.env.PORT || 3000;

// Estat global per guardar senyals
global.lastSignals = [];

// Servir HTML del panell
app.use(express.static("public"));

// Endpoint que retorna les senyals detectades
app.get("/signals", (req, res) => {
  res.json(lastSignals);
});

app.listen(PORT, () => {
  console.log("🌐 Panell web actiu al port", PORT);
});

// 🔹 Connectar a PostgreSQL
await initDB();

// 🔹 Bucle principal
async function loop() {
  console.log("⏳ Executant loop de scalping...");

  for (const symbol of pairs) {
    try {
      const signal = await runScalping(client, symbol);

      // Si hi ha senyal → guardar-la per al panell
      if (signal) {
        lastSignals.push({
          symbol,
          time: Date.now(),
          ...signal
        });

        // Limitem a les últimes 30
        if (lastSignals.length > 30) lastSignals.shift();
      }

    } catch (err) {
      console.log("❌ Error en runScalping:", symbol, err.message);
    }
  }
}

// Executar cada 60 segons
setInterval(loop, 60 * 1000);

// Executar immediatament en arrencar
loop();
