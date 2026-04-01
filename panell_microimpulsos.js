// panell_microimpulsos.js

import http from "http";
import { initDB, client } from "./db/client.js";
import { formatSpainTime } from "./core/utils.js";

// -------------------------------------------------------------
// LLEGIR ALERTES ACTIVES (NO CADUCADES)
// -------------------------------------------------------------
async function getActiveSignals() {
  const nowMs = Date.now();

  const q = await client.query(
    `
    SELECT symbol, timeframe, type, entry,
           timestamp, timestamp_es, date_es, hora_es,
           reason, sensitivity, expires_at
    FROM signals2
    WHERE expires_at > $1
    ORDER BY timestamp DESC
    `,
    [nowMs]
  );

  return q.rows;
}

// -------------------------------------------------------------
// GENERAR TAULA D’ALERTES ACTIVES
// -------------------------------------------------------------
function renderActiveSignalsTable(signals) {
  let rows = "";

  for (const s of signals) {
    const expiresInSec = Math.floor((s.expires_at - Date.now()) / 1000);

    rows += `
      <tr>
        <td>${s.symbol}</td>
        <td>${s.timeframe}</td>
        <td>${s.type}</td>
        <td>${s.entry.toFixed(4)}</td>
        <td>${s.date_es} ${s.hora_es}</td>
        <td>${expiresInSec}s</td>
      </tr>
    `;
  }

  return `
    <h2>Alertes Actives</h2>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>TF</th>
          <th>Tipus</th>
          <th>Entrada</th>
          <th>Hora</th>
          <th>Caduca en</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// -------------------------------------------------------------
// SERVIDOR HTTP
// -------------------------------------------------------------
async function startPanel() {
  await initDB();

  http.createServer(async (req, res) => {
    if (req.url === "/") {
      const signals = await getActiveSignals();
      const signalsHTML = renderActiveSignalsTable(signals);
      const lastUpdate = formatSpainTime(Date.now());

      const html = `
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="5">
        <style>
          body {
            background-color: #000;
            color: #00ff00;
            font-family: Consolas, monospace;
            padding: 20px;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 40px;
          }
          th, td {
            border: 1px solid #00ff00;
            padding: 6px;
            text-align: center;
          }
          th {
            background-color: #003300;
          }
        </style>
      </head>
      <body>
        <h1>Panell Microimpulsos FIAT</h1>
        <p><b>Última actualització:</b> ${lastUpdate}</p>

        ${signalsHTML}

      </body>
      </html>
      `;

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(200);
    res.end("Panell Microimpulsos FIAT OK");
  }).listen(process.env.PORT || 3000);

  console.log("Panell Microimpulsos FIAT en marxa");
}

startPanel();
