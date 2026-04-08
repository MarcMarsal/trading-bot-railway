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

// -----------------------------
//  EXPRESS — ARRANCA IMMEDIATAMENT
// -----------------------------
const app = express();
const PORT = process.env.PORT || 3000;

global.lastSignals = [];

// Ruta absoluta a /public

app.use(express.static(path.resolve("public")));
app.get("/signals", async (req, res) => {
  try {
    const result = await client.query(`
      SELECT 
        "Az symbol" AS symbol,
        "Az timeframe" AS timeframe,
        "Az tipo" AS direction,
        "l23 entry" AS entry,
        "l23 timestamp" AS timestamp,
        "Az timestamp_es" AS timestamp_es
      FROM signals
      ORDER BY "l23 timestamp" DESC
      LIMIT 50
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("❌ Error carregant senyals:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// 🔥 ARRANQUEM EXPRESS JA (Railway ho necessita)
setImmediate(() => {
  app.listen(PORT, () => {
    console.log("🌐 Panell web actiu al port", PORT);
  });
});

// -----------------------------
//  BASE DE DADES (NO BLOQUEJA EXPRESS)
// -----------------------------
initDB()
  .then(() => console.log("🗄️ DB connectada"))
  .catch(err => console.log("❌ Error DB:", err.message));

// -----------------------------
//  LOOP PRINCIPAL
// -----------------------------
async function loop() {
  console.log("⏳ Executant loop de scalping...");

  for (const symbol of pairs) {
    try {
      const signal = await runScalping(client, symbol);

      if (signal) {
        const last = lastSignals[lastSignals.length - 1];
        const isDuplicate =
          last &&
          last.symbol === symbol &&
          last.direction === signal.direction &&
          Date.now() - last.time < 5000;

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

// Executar un cop al principi
setTimeout(loop, 2000);

// Executar cada 60 segons
setInterval(loop, 60 * 1000);
