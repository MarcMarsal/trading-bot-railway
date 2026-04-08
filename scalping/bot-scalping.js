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

// Servir carpeta public
app.use(express.static(path.resolve("public")));

// -----------------------------
//  ENDPOINT HEALTHCHECK (SEGUR)
// -----------------------------
app.get("/signals", (req, res) => {
  res.json({ status: "ok" });
});

// -----------------------------
//  ENDPOINT REAL QUE LLEGEIX LA BASE DE DADES
// -----------------------------
app.get("/signals/db", async (req, res) => {
  try {
    const result = await client.query(`
      SELECT 
        "symbol" AS symbol,
        "timeframe" AS timeframe,
        "tipo" AS direction,
        "entry" AS entry,
        "timestamp" AS timestamp,
        "timestamp_es" AS timestamp_es
      FROM signals
      ORDER BY "timestamp" DESC
      LIMIT 50
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("❌ Error carregant senyals:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/signals/view", async (req, res) => {
  try {
    const result = await client.query(`
      SELECT 
        symbol,
        timeframe,
        tipo AS direction,
        entry,
        timestamp,
        timestamp_es
      FROM signals
      ORDER BY timestamp DESC
      LIMIT 50
    `);

    const rows = result.rows;

    const html = `
      <html>
      <head>
        <meta http-equiv="refresh" content="5">
        <style>
          body {
            background: #000;
            color: #0f0;
            font-family: Consolas, monospace;
            padding: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #0f0;
            padding: 8px;
            text-align: left;
          }
          th {
            background: #003300;
          }
          tr:nth-child(even) {
            background: #001a00;
          }
          tr:nth-child(odd) {
            background: #000;
          }
        </style>
      </head>
      <body>
        <h1>📡 Senyals del Bot (últimes 50)</h1>
        <table>
          <tr>
            <th>Symbol</th>
            <th>Timeframe</th>
            <th>Direcció</th>
            <th>Entry</th>
            <th>Timestamp</th>
            <th>Timestamp ES</th>
          </tr>
          ${rows.map(r => `
            <tr>
              <td>${r.symbol}</td>
              <td>${r.timeframe}</td>
              <td>${r.direction}</td>
              <td>${r.entry}</td>
              <td>${r.timestamp}</td>
              <td>${r.timestamp_es}</td>
            </tr>
          `).join("")}
        </table>
      </body>
      </html>
    `;

    res.send(html);

  } catch (err) {
    console.error("❌ Error carregant senyals:", err.message);
    res.status(500).send("Error carregant senyals");
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
          Date.now() - last.time < 60000;

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
