// panell_microimpulsos.js

import http from "http";
import { initDB, client } from "./db/client.js";
import { formatSpainTime } from "./core/utils.js";

// -------------------------------------------------------------
// FORMATADOR NUMÈRIC
// -------------------------------------------------------------
function fmt(n) {
  return n !== null && n !== undefined ? Number(n).toFixed(4) : "-";
}

// -------------------------------------------------------------
// LLEGIR LES ÚLTIMES 20 ALERTES (ordenades per timestamp real)
// -------------------------------------------------------------
async function getActiveSignals() {
  const q = await client.query(
    `
    SELECT symbol, timeframe, type,
           entry, entryr, tp, sl,
           timestamp, timestamp_es, date_es, hora_es,
           reason, sensitivity, created_at, status
    FROM signals2
    ORDER BY timestamp DESC
    LIMIT 20
    `
  );

  return q.rows;
}

// -------------------------------------------------------------
// GENERAR TAULA D’ALERTES
// -------------------------------------------------------------
function renderActiveSignalsTable(signals) {
  let rows = "";

  for (const s of signals) {
     

    // URL correcta Bitunix
    const bitunixUrl = `https://www.bitunix.com/es-es/contract-trade/${s.symbol}`;

    // Classes de color segons tipus
    let rowClass = "";
    if (s.type === "MS (UP)") rowClass = "ms-up";
    if (s.type === "MS (DOWN)") rowClass = "ms-down";
    if (s.type === "CLUSTER (UP)") rowClass = "cluster-up";
    if (s.type === "CLUSTER (DOWN)") rowClass = "cluster-down";

    // SL manual per clústers
    const slDisplay = s.type.includes("CLUSTER") ? "manual" : fmt(s.sl);

    rows += `
      <tr class="${rowClass}">
        <td>${s.symbol}</td>
        <td>${s.timeframe}</td>
        <td>${s.type}</td>
        <td>${fmt(s.entry)}</td>
        <td>${fmt(s.entryr)}</td>
        <td>${fmt(s.tp)}</td>
        <td>${slDisplay}</td>
        <td>${formatSpainTime(s.timestamp * 1000)}</td>
        <td>
          <button onclick="openBitunix('${bitunixUrl}', '${fmt(s.entryr)}')">
            Obrir Bitunix
          </button>
        </td>
      </tr>
    `;
  }

  return `
    <h2>Últimes 20 alertes</h2>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>TF</th>
          <th>Tipus</th>
          <th>Entrada</th>
          <th>Entrada (retroces)</th>
          <th>TP</th>
          <th>SL</th>
          <th>Creat a</th>
          <th>Acció</th>
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
          button {
            background-color: #004400;
            color: #00ff00;
            border: 1px solid #00ff00;
            padding: 4px 8px;
            cursor: pointer;
          }
          button:hover {
            background-color: #006600;
          }

          /* Colors per tipus de senyal */
          .ms-up { color: #00ff00; }
          .ms-down { color: #ff4444; }
          .cluster-up { color: #00ff88; font-weight: bold; }
          .cluster-down { color: #ff6666; font-weight: bold; }

        </style>

        <script>
          function openBitunix(url, entryr) {
            navigator.clipboard.writeText(entryr);

            const screenWidth = window.screen.width;
            const screenHeight = window.screen.height;

            const width = Math.floor(screenWidth / 2);
            const height = screenHeight;
            const left = screenWidth - width;
            const top = 0;

            window.open(
              url,
              "_blank",
              "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top
            );
          }
        </script>

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
