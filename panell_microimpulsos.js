// panell_microimpulsos.js — VERSIÓ FINAL 1:1 TRADINGVIEW

import http from "http";
import { initDB, client } from "./db/client.js";
import { formatSpainTime } from "./core/utils.js";

// Formatador numèric
function fmt(n) {
  return n !== null && n !== undefined ? Number(n).toFixed(4) : "-";
}

// Llegir últimes 20 alertes
async function getActiveSignals() {
  const q = await client.query(
    `
    SELECT symbol, timeframe, type,
           entry, entryr, tp, sl,
           timestamp, reason, created_at
    FROM signals2
    ORDER BY timestamp DESC
    LIMIT 20
    `
  );

  return q.rows;
}

// Generar taula
function renderActiveSignalsTable(signals) {
  let rows = "";

  for (const s of signals) {

    // URL Bitunix
    //const bitunixUrl = `https://www.bitunix.com/es-es/contract-trade/${s.symbol}`;
    const symbolNoDash = s.symbol.replace("-", "");
    const bitunixUrl = `https://www.bitunix.com/es-es/contract-trade/${symbolNoDash}`;


    // Classes de color segons tipus
    let rowClass = "";

    if (s.type === "M") rowClass = "ms-up";
    if (s.type === "E") rowClass = "ms-down";

    if (s.type === "M_WEAK") rowClass = "weak-up";
    if (s.type === "E_WEAK") rowClass = "weak-down";

    if (s.type === "DISCARD_MS") rowClass = "discard-up";
    if (s.type === "DISCARD_ES") rowClass = "discard-down";

    if (s.type === "CLUSTER_UP") rowClass = "cluster-up";
    if (s.type === "CLUSTER_DOWN") rowClass = "cluster-down";

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
        <td>${s.reason || "-"}</td>
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
          <th>Motiu</th>
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

          /* Colors per tipus */
          .ms-up { color: #00ff00; }
          .ms-down { color: #ff4444; }

          .weak-up { color: #3399ff; }
          .weak-down { color: #3399ff; }

          .discard-up { color: #66ccff; }
          .discard-down { color: #66ccff; }

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

  console.log("Panell Microimpulsos FIAT en marxa (versió 1:1 TradingView)");
}

startPanel();
