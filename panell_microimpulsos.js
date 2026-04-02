// panell_microimpulsos.js

import http from "http";
import { initDB, client } from "./db/client.js";
import { formatSpainTime } from "./core/utils.js";

// -------------------------------------------------------------
// LLEGIR ALERTES DELS ÚLTIMS 10 MINUTS
// -------------------------------------------------------------
async function getActiveSignals() {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000); // Date, no ms!

  const q = await client.query(
    `
    SELECT symbol, timeframe, type, entry,
           timestamp, timestamp_es, date_es, hora_es,
           reason, sensitivity, created_at, status
    FROM signals2
    WHERE created_at >= $1
    ORDER BY created_at DESC
    `,
    [tenMinAgo]
  );

  return q.rows;
}

// -------------------------------------------------------------
// GENERAR TAULA D’ALERTES ACTIVES
// -------------------------------------------------------------
function renderActiveSignalsTable(signals) {
  let rows = "";

  for (const s of signals) {
    rows += `
      <tr class="${s.status}">
        <td>${s.symbol}</td>
        <td>${s.timeframe}</td>
        <td>${s.type}</td>
        <td>${s.status}</td>
        <td>${s.entry ? s.entry.toFixed(4) : "-"}</td>
        <td>${formatSpainTime(s.created_at)}</td>
      </tr>
    `;
  }

  return `
    <h2>Alertes Recents (últims 10 minuts)</h2>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>TF</th>
          <th>Tipus</th>
          <th>Status</th>
          <th>Entrada</th>
          <th>Creat a</th>
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

          /* STATUS COLORS */
          tr.early td {
            background-color: #333300; /* groc fosc */
          }
          tr.confirmed td {
            background-color: #003300; /* verd fosc */
          }
          tr.invalidated td {
            background-color: #333333; /* gris fosc */
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
