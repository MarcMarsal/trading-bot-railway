// panell_microimpulsos.js

import http from "http";
import { initDB, client } from "./db/client.js";
import { getCandles } from "./core/candles.js";
import { calcReliability } from "./core/reliability.js";
import { formatSpainTime } from "./core/utils.js";

// -------------------------------------------------------------
// CONFIGURACIÓ
// -------------------------------------------------------------
const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["15m", "30m", "1H", "4H"];

// -------------------------------------------------------------
// LLEGIR MICROIMPULSOS RECENTS
// -------------------------------------------------------------
async function getRecentSignals(limit = 10) {
  const q = await client.query(
    `
    SELECT symbol, timeframe, type, entry,
           timestamp, timestamp_es, date_es, hora_es,
           reason, sensitivity
    FROM signals2
    ORDER BY timestamp DESC
    LIMIT $1
    `,
    [limit]
  );

  return q.rows;
}

// -------------------------------------------------------------
// GENERAR TAULA DE MICROIMPULSOS
// -------------------------------------------------------------
function renderSignalsTable(signals) {
  let rows = "";

  for (const s of signals) {
    rows += `
      <tr>
        <td>${s.symbol}</td>
        <td>${s.timeframe}</td>
        <td>${s.type}</td>
        <td>${s.entry.toFixed(4)}</td>
        <td>${s.date_es} ${s.hora_es}</td>
        <td>${s.reason}</td>
        <td>${s.sensitivity}</td>
      </tr>
    `;
  }

  return `
    <h2>Microimpulsos Recents</h2>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>TF</th>
          <th>Tipus</th>
          <th>Entrada</th>
          <th>Hora</th>
          <th>Reason</th>
          <th>Sensitivity</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// -------------------------------------------------------------
// GENERAR TAULA DE FIABILITAT
// -------------------------------------------------------------
async function renderReliabilityTable() {
  let rows = "";

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      const candles = await getCandles(symbol, timeframe, 120);
      if (!candles || candles.length < 60) continue;

      const {
        trendPercent,
        msPercent,
        contextLabel,
        volumeOK,
        msNow,
        esNow
      } = calcReliability(candles);

      rows += `
        <tr>
          <td>${symbol}</td>
          <td>${timeframe}</td>
          <td>${trendPercent}%</td>
          <td>${msPercent}%</td>
          <td>${contextLabel}</td>
          <td>${volumeOK ? "OK" : "LOW"}</td>
          <td>${msNow ? "MS" : esNow ? "ES" : "-"}</td>
        </tr>
      `;
    }
  }

  return `
    <h2>Estat Actual del Mercat</h2>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>TF</th>
          <th>Trend%</th>
          <th>MS/ES%</th>
          <th>Context</th>
          <th>Volum</th>
          <th>MS/ES Ara</th>
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
      const signals = await getRecentSignals(10);
      const signalsHTML = renderSignalsTable(signals);
      const reliabilityHTML = await renderReliabilityTable();
      const lastUpdate = formatSpainTime(Date.now());

      const html = `
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="60">
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
        <h1>Panell Microimpulsos 2.0</h1>
        <p><b>Última actualització:</b> ${lastUpdate}</p>

        ${signalsHTML}
        ${reliabilityHTML}

      </body>
      </html>
      `;

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(200);
    res.end("Panell Microimpulsos 2.0 OK");
  }).listen(process.env.PORT || 3000);

  console.log("Panell Microimpulsos 2.0 en marxa");
}

startPanel();
