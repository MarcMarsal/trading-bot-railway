// panell_microimpulsos.js — FIAT v1 PUR (1:1 amb el bot)

import http from "http";
import { initDB, client } from "./db/client.js";
import { formatSpainTime } from "./core/utils.js";

// Formatador numèric
function fmt(n) {
  return n !== null && n !== undefined ? Number(n).toFixed(4) : "-";
}

// Llegir últimes 20 alertes FIAT v1
async function getActiveSignals() {
  const q = await client.query(
    `
    SELECT
      symbol, timeframe, type,
      entry, entryr, tp, sl,
      timestamp_ms,
      created_at,
      score, is_good
    FROM signals2
    ORDER BY created_at DESC
    LIMIT 20
    `
  );

  return q.rows;
}


// Generar taula
function renderActiveSignalsTable(signals) {
  let rows = "";

  for (const s of signals) {

    // Colors FIAT v1
    let rowClass = "";

    if (s.type === "M_GOOD") rowClass = "m-good";
    if (s.type === "M_DISCARD") rowClass = "m-discard";

    if (s.type === "E_GOOD") rowClass = "e-good";
    if (s.type === "E_DISCARD") rowClass = "e-discard";

    const symbolNoDash = s.symbol.replace("-", "");
    const bitunixUrl = `https://www.bitunix.com/es-es/contract-trade/${symbolNoDash}`;

    rows += `
      <tr class="${rowClass}">
        <td>${s.symbol}</td>
        <td>${s.timeframe}</td>
        <td>${s.type}</td>
        <td>${fmt(s.entry)}</td>
        <td>${fmt(s.entryr)}</td>
        <td>${fmt(s.tp)}</td>
        <td>${fmt(s.sl)}</td>
        <td>${formatSpainTime(s.created_at)}</td>
        <td>${fmt(s.score)}</td>
        <td>${s.is_good ? "GOOD" : "DISCARD"}</td>
        <td>
          <button onclick="openBitunix('${bitunixUrl}', '${fmt(s.entryr)}')">
            Obrir Bitunix
          </button>
        </td>
      </tr>
    `;
  }

  return `
    <h2>Últimes 20 alertes FIAT v1</h2>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>TF</th>
          <th>Tipus</th>
          <th>Entrada</th>
          <th>EntradaR</th>
          <th>TP</th>
          <th>SL</th>
          <th>Creat a</th>
          <th>Score</th>
          <th>Classificació</th>
          <th>Acció</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// Servidor HTTP
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

          /* Colors FIAT v1 */
          .m-good { color: #00ff00; }
          .m-discard { color: #66ccff; }

          .e-good { color: #ff4444; }
          .e-discard { color: #66ccff; }

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
        <h1>Panell Microimpulsos FIAT v1</h1>
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
    res.end("Panell FIAT v1 OK");
  }).listen(process.env.PORT || 3000);

  console.log("Panell Microimpulsos FIAT v1 en marxa");
}

startPanel();
