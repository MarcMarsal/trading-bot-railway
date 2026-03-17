// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import axios from "axios";
import cron from "node-cron";
import { Client } from "pg";
import http from "http";

// -------------------------------------------------------------
// POSTGRESQL
// -------------------------------------------------------------
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      timestamp BIGINT NOT NULL,
      timestamp_es BIGINT,
      date_es TEXT,
      PRIMARY KEY (symbol, timeframe, timestamp)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS signals (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      tipo TEXT NOT NULL,
      entry REAL NOT NULL,
      timestamp BIGINT NOT NULL,
      PRIMARY KEY (symbol, timeframe, tipo, timestamp)
    );
  `);

  console.log("PostgreSQL OK — Taules creades amb PK");
}

// -------------------------------------------------------------
// CONFIGURACIÓ
// -------------------------------------------------------------
const SYMBOLS = [
  "BTC-USDT",
  "SUI-USDT",
  "SOL-USDT",
  "XRP-USDT",
  "AVAX-USDT",
  "APT-USDT",
  "INJ-USDT",
  "SEI-USDT",
  "ADA-USDT",
  "LINK-USDT",
  "BNB-USDT",
  "ETH-USDT",
  "NEAR-USDT",
  "HBAR-USDT",
  "RENDER-USDT",
  "ASTER-USDT",
  "BCH-USDT"

];

const RETRACEMENT_PERCENT = 20;   // o el percentatge que vulguis

const API_URL = "https://www.okx.com/api/v5/market/candles";

// -------------------------------------------------------------
// FUNCIONS BASE (igual que TradingView)
// -------------------------------------------------------------
const strongBodyPct = 0.5; // igual que TradingView
const minStrongRange = 0.0;
const maxBodyPctIndecision = 0.3;
const minRangeIndecision = 0.0;

function body(o, c) {
  return Math.abs(c - o);
}

function range(h, l) {
  return h - l;
}

function bodyPct(o, h, l, c) {
  const r = range(h, l);
  return r === 0 ? 0 : body(o, c) / r;
}

function isBull(o, c) {
  return c > o;
}

function isBear(o, c) {
  return c < o;
}

function isStrongBull(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  const rng = range(h, l);
  const rngPct = (rng / c) * 100;
  return (
    bp >= strongBodyPct &&
    (minStrongRange <= 0 || rngPct >= minStrongRange) &&
    isBull(o, c)
  );
}

function isStrongBear(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  const rng = range(h, l);
  const rngPct = (rng / c) * 100;
  return (
    bp >= strongBodyPct &&
    (minStrongRange <= 0 || rngPct >= minStrongRange) &&
    isBear(o, c)
  );
}

function isIndecision(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  const rng = range(h, l);
  const rngPct = (rng / c) * 100;
  return (
    bp <= maxBodyPctIndecision &&
    (minRangeIndecision <= 0 || rngPct >= minRangeIndecision)
  );
}

function detectPattern(velas) {
  if (!velas || velas.length < 4) {
    return { msNow: false, esNow: false };
  }

  const n = velas.length;
  const v1 = velas[n - 4];
  const v2 = velas[n - 3];
  const v3 = velas[n - 2];

  if (!v1 || !v2 || !v3) {
    return { msNow: false, esNow: false };
  }

  const strongBull = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return false;
    return (body / range) >= 0.5 && v.close > v.open;
  };

  const strongBear = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return false;
    return (body / range) >= 0.5 && v.close < v.open;
  };

  const indecision = (v) => {
    const body = Math.abs(v.close - v.open);
    const range = v.high - v.low;
    if (range === 0) return true;
    return (body / range) <= 0.3;
  };

  const msNow =
    strongBear(v1) &&
    indecision(v2) &&
    strongBull(v3);

  const esNow =
    strongBull(v1) &&
    indecision(v2) &&
    strongBear(v3);

  return { msNow, esNow, v1, v2, v3 };
}

// -------------------------------------------------------------
// VALIDTREND
// -------------------------------------------------------------
function validTrend(msNow, esNow, v1, v2, v3) {
  const mid1 = (v1.open + v1.close) / 2;

  const msTrend = msNow && v2.low < v1.low && v3.close > mid1;
  const esTrend = esNow && v2.high > v1.high && v3.close < mid1;

  return msTrend || esTrend;
}

// -------------------------------------------------------------
// PIVOTS + STRUCTUREOK
// -------------------------------------------------------------
function findPivotLow(velas) {
  const idx = velas.length - 3; // v1, igual que TV
  if (idx < 2 || idx + 2 >= velas.length) return null;

  const center = velas[idx].low;

  if (
    velas[idx - 1].low > center &&
    velas[idx - 2].low > center &&
    velas[idx + 1].low > center &&
    velas[idx + 2].low > center
  ) return idx;

  return null;
}

function findPivotHigh(velas) {
  const idx = velas.length - 3; // v1, igual que TV
  if (idx < 2 || idx + 2 >= velas.length) return null;

  const center = velas[idx].high;

  if (
    velas[idx - 1].high < center &&
    velas[idx - 2].high < center &&
    velas[idx + 1].high < center &&
    velas[idx + 2].high < center
  ) return idx;

  return null;
}

function structureOK(msNow, esNow, velas) {
  const pivotLow = findPivotLow(velas);
  const pivotHigh = findPivotHigh(velas);

  const lastIdx = velas.length - 1;

  const nearLow = pivotLow !== null && (lastIdx - pivotLow <= 5);
  const nearHigh = pivotHigh !== null && (lastIdx - pivotHigh <= 5);

  return (msNow && nearLow) || (esNow && nearHigh);
}

// -------------------------------------------------------------
// INWINDOW
// -------------------------------------------------------------
function inWindow(openTime) {
  const now = Date.now();
  const periodMinutes = 10080; // 1 setmana, igual que TV
  const startTime = now - periodMinutes * 60000;
  return openTime >= startTime;
}

//function classifySignal(velas) {
//  if (!velas || velas.length < 4) return null;

//  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);

  // 🔥 Validació crítica
  //if (!v1 || !v2 || !v3) return null;
  //if (!v3.close || !v3.open || !v3.timestamp) return null;

  //if (!msNow && !esNow) return null;

  //if (!inWindow(v3.timestamp)) return null;

  //const vt = validTrend(msNow, esNow, v1, v2, v3);
  //const st = structureOK(msNow, esNow, velas);

  //const tipoBase = msNow ? "MS" : "ES";
  //const tipoVX = "V";

  //return { tipoBase, tipoVX, v2, v3};
//}
function classifySignal(velas) {
  if (!velas || velas.length < 4) return null;

  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);

  // 🔥 Validació crítica
  if (!v1 || !v2 || !v3) return null;
  if (!v3.close || !v3.open || !v3.timestamp) return null;

  if (!msNow && !esNow) return null;

  if (!inWindow(v3.timestamp)) return null;

  const vt = validTrend(msNow, esNow, v1, v2, v3);
  const st = structureOK(msNow, esNow, velas);

  const tipoBase = msNow ? "MS" : "ES";
  const tipoVX = "V";

  // ⭐ AFEGIM LA PUNTUACIÓ (sense tocar res més)
  const score = patternScore(v1, v2, v3, velas, msNow, esNow);

  return { tipoBase, tipoVX, v2, v3, score };
}



// -------------------------------------------------------------
// INDICADORS
// -------------------------------------------------------------

// -------------------------------------------------------------
// TP / SL
// -------------------------------------------------------------
function calcTargets(tipoBase, entry, roi = 0.01) {
  if (tipoBase === "MS") {
    return {
      tp: entry * (1 + roi),
      sl: entry * (1 - roi)
    };
  } else {
    return {
      tp: entry * (1 - roi),
      sl: entry * (1 + roi)
    };
  }
}

// -------------------------------------------------------------
// ANTI-DUPLICATS
// -------------------------------------------------------------
async function alreadySent(symbol, timeframe, tipo, entry) {
  const res = await client.query(
    `SELECT 1 FROM signals 
     WHERE symbol=$1 AND timeframe=$2 AND tipo=$3 AND ABS(entry - $4) < 0.0000001`,
    [symbol, timeframe, tipo, entry]
  );
  return res.rows.length > 0;
}

async function saveSignal(symbol, timeframe, tipo, entry, timestamp, timestampEs) {
  await client.query(
    `INSERT INTO signals (symbol, timeframe, tipo, entry, timestamp, timestamp_es)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (symbol, timeframe, tipo, timestamp) DO NOTHING`,
    [symbol, timeframe, tipo, entry, timestamp, timestampEs]
  );
}


// -------------------------------------------------------------
// FETCH CANDLES OKX
// -------------------------------------------------------------
async function fetchCandles(symbol, interval) {
  const url = `${API_URL}?instId=${symbol}&bar=${interval}&limit=4`;



  const res = await axios.get(url);
  const data = res.data.data;

  if (!data || data.length === 0) return [];

  return data.reverse().map(k => ({
    timestamp: parseInt(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

// -------------------------------------------------------------
// SAVE CANDLES (POSTGRES) — UPSERT + DATA ESPANYOLA
// -------------------------------------------------------------
async function saveCandles(symbol, timeframe, candles) {
  for (const c of candles) {

    const ts = c.timestamp;

    const tsEs = new Date(
      new Date(ts).toLocaleString("en-US", { timeZone: "Europe/Madrid" })
    ).getTime();

    const dateEs = new Date(ts).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).replace(",", "");

    await client.query(
      `INSERT INTO candles (symbol, timeframe, open, high, low, close, volume, timestamp, timestamp_es, date_es)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (symbol, timeframe, timestamp)
       DO UPDATE SET
         open = EXCLUDED.open,
         high = EXCLUDED.high,
         low = EXCLUDED.low,
         close = EXCLUDED.close,
         volume = EXCLUDED.volume,
         timestamp_es = EXCLUDED.timestamp_es,
         date_es = EXCLUDED.date_es`,
      [
        symbol,
        timeframe,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        ts,
        tsEs,
        dateEs
      ]
    );
  }
}

async function detectAndSend(symbol, timeframe) {
  const q = await client.query(
    `SELECT open, high, low, close, volume, timestamp_open, timestamp_close
     FROM candles
     WHERE symbol = $1 AND timeframe = $2
     ORDER BY timestamp_close DESC
     LIMIT 4`,
    [symbol, timeframe]
  );

  const velas = q.rows.reverse();
  // VALIDACIÓ CRÍTICA: totes les veles han de tenir dades completes
for (const v of velas) {
  if (!v || v.open == null || v.close == null || v.high == null || v.low == null || v.timestamp_close == null) {
    console.log(symbol, timeframe, "→ ERROR: vela incompleta a la BD");
    return;
  }
}

  if (velas.length < 4) return;

  // 🔥 Validació dura: evitar veles incompletes
  for (const v of velas) {
    if (!v || v.open == null || v.close == null || v.high == null || v.low == null || v.timestamp_close == null) {
      console.log(symbol, timeframe, "→ ERROR: vela incompleta a la BD");
      return;
    }
  }

  const v1 = velas[1];
  const v2 = velas[2];
  const v3 = velas[3];

  if (!v1 || !v2 || !v3) {
    console.log(symbol, timeframe, "→ ERROR: veles incompletes");
    return;
  }

  if (Date.now() < v3.timestamp_close) return;

  const signal = classifySignal(velas);
  if (!signal) return;

  const { tipoBase, tipoVX } = signal;
  if (tipoVX === "X") return;

  const tipo = tipoBase;

  const body = Math.abs(v3.close - v3.open);
  const retr = body * (RETRACEMENT_PERCENT / 100);

  let entry;
  if (tipo === "MS") {
    entry = v3.close - retr;
  } else {
    entry = v3.close + retr;
  }

  const timestamp = v3.timestamp_close;
  const timestampEs = formatSpainTime(timestamp);

  if (await alreadySent(symbol, timeframe, tipo, entry)) return;

  const arrow = tipo === "MS" ? "↑" : "↓";
  const msg =
    `<b>${symbol} ${arrow} ${timeframe}</b>\n` +
    `${timestampEs}`;

  const sent = await sendTelegram(msg);

  if (sent) {
    await saveSignal(symbol, timeframe, tipo, entry, timestamp, timestampEs);
    console.log(symbol, `→ SENYAL ${timeframe} ENVIAT:`, tipo);
  }
}


// -------------------------------------------------------------
// TELEGRAM
// -------------------------------------------------------------
async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;

  const payload = {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML"
  };

  try {
    const res = await axios.post(url, payload);
    if (res.status === 200) return true;
    return false;
  } catch (e) {
    console.error("Error enviant Telegram:", e.message);
    return false;
  }
}


// -------------------------------------------------------------
// FORMAT HORA ESPANYOLA
// -------------------------------------------------------------
function formatSpainTime(ts) {
  const date = new Date(ts);
  return date.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).replace(",", "");
}

function preSignal(velas) {
  if (velas.length < 3) return null;

  const v2 = velas[velas.length - 2]; // última tancada
  const v1 = velas[velas.length - 3]; // penúltima tancada

  const v1Type = isStrongBull(v1.open, v1.high, v1.low, v1.close)
    ? "strongBull"
    : isStrongBear(v1.open, v1.high, v1.low, v1.close)
    ? "strongBear"
    : isIndecision(v1.open, v1.high, v1.low, v1.close)
    ? "indecision"
    : "other";

  const v2Type = isStrongBull(v2.open, v2.high, v2.low, v2.close)
    ? "strongBull"
    : isStrongBear(v2.open, v2.high, v2.low, v2.close)
    ? "strongBear"
    : isIndecision(v2.open, v2.high, v2.low, v2.close)
    ? "indecision"
    : "other";

  return {
    v1: v1Type,
    v2: v2Type,
    MS_possible: v1Type === "strongBear" && v2Type === "indecision",
    ES_possible: v1Type === "strongBull" && v2Type === "indecision"
  };
}

cron.schedule("* * * * *", async () => {
  try {
    for (const symbol of SYMBOLS) {
      for (const timeframe of ["15m", "30m", "1H", "4H"]) {
        try {
          const candles = await fetchCandles(symbol, timeframe);
          if (!candles || candles.length === 0) continue;

          await saveCandles(symbol, timeframe, candles);

          const signal = classifySignal(candles);
if (!signal) continue;

//const { tipoBase, tipoVX, v2, v3 } = signal;
const { tipoBase, tipoVX, v2, v3, score } = signal;

// Validació crítica
if (!v3 || v3.open == null || v3.close == null) {
  console.log(symbol, timeframe, "→ ERROR: v3 incompleta");
  continue;
}

if (tipoVX === "X") continue;

const tipo = tipoBase;
const entry = v3.close;



const timestamp = v3.timestamp;
const timestampEs = formatSpainTime(timestamp);


          if (await alreadySent(symbol, timeframe, tipo, entry)) continue;

          const arrow = tipo === "MS" ? "↑" : "↓";
          //const msg =
          //  `<b>${symbol} ${arrow} ${timeframe}</b>\n` +
          //  `${timestampEs}`;
const msg =
  `<b>${symbol} ${arrow} ${timeframe}</b>\n` +
  `Score: ${score}/10\n` +
  `${timestampEs}`;

          const sent = await sendTelegram(msg);

          if (sent) {
            await saveSignal(symbol, timeframe, tipo, entry, timestamp, timestampEs);
            console.log(symbol, timeframe, "→ SENYAL ENVIAT:", tipo);
          }

        } catch (err) {
          console.error(symbol, timeframe, "→ ERROR INTERIOR:", err.message);
        }
      }
    }
  } catch (err) {
    console.error("ERROR GLOBAL AL CRON ÚNIC:", err.message);
  }
});




// -------------------------------------------------------------
// INIT DB I SERVIDOR HTTP
// -------------------------------------------------------------

initDB().then(() => {
  console.log("DB OK — arrencant servidor HTTP");

  http.createServer(async (req, res) => {

  if (req.url === "/panel") {

  const TIMEFRAMES = [
    { tf: "15m", color: "#00ff00" },   // verd
    { tf: "30m", color: "#00ffff" },   // cian
    { tf: "1H",  color: "#ffff00" },   // groc
    { tf: "4H",  color: "#ffa500" }    // taronja
  ];

  let htmlBlocks = "";
  const lastUpdate = formatSpainTime(Date.now());

  for (const { tf, color } of TIMEFRAMES) {

    let rows = "";

    for (const symbol of SYMBOLS.sort()) {   // ORDENACIÓ ALFABÈTICA
      const q = await client.query(
        `SELECT open, high, low, close, volume, timestamp
         FROM candles
         WHERE symbol = $1 AND timeframe = $2
         ORDER BY timestamp DESC
         LIMIT 3`,
        [symbol, tf]
      );

      const candles = q.rows.reverse();
      if (candles.length < 3) continue;

      const ps = preSignal(candles);
      const hasV = ps.MS_possible || ps.ES_possible;   // PER AL CHECKBOX

      rows += `
        <tr style="color:${color}" data-has-v="${hasV}">
          <td><b>${symbol}</b></td>
          <td>${ps.v1}</td>
          <td>${ps.v2}</td>

          <td style="color:${ps.MS_possible ? '#00ff00' : '#ff0000'}">
            ${ps.MS_possible ? "✔" : "✘"}
          </td>

          <td style="color:${ps.ES_possible ? '#00ff00' : '#ff0000'}">
            ${ps.ES_possible ? "✔" : "✘"}
          </td>
        </tr>
      `;
    }

    htmlBlocks += `
      <h2 style="color:${color}">Timeframe ${tf}</h2>
      <table>
        <tr>
          <th>Symbol</th>
          <th>v1</th>
          <th>v2</th>
          <th>Possible MS</th>
          <th>Possible ES</th>
        </tr>
        ${rows}
      </table>
      <br><br>
    `;
  }

  const html = `
  <html>
  <head>
    <meta http-equiv="refresh" content="300">
    <meta charset="UTF-8">
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
      }
      th, td {
        border: 1px solid #00ff00;
        padding: 8px;
        text-align: center;
      }
      th {
        background-color: #003300;
      }
    </style>

    <script>
      function toggleFilter() {
        const checked = document.getElementById("filterV").checked;
        const rows = document.querySelectorAll("tr[data-has-v]");
        rows.forEach(row => {
          const hasV = row.getAttribute("data-has-v") === "true";
          row.style.display = checked && !hasV ? "none" : "";
        });
      }
    </script>

  </head>
  <body>

    <h1>Panell de detecció MS/ES</h1>
    <p><b>Última actualització:</b> ${lastUpdate}</p>

    <label style="color:#fff;">
      <input type="checkbox" id="filterV" onchange="toggleFilter()">
      Mostrar només parells amb ✔ (possible MS/ES)
    </label>
    <br><br>

    ${htmlBlocks}

  </body>
  </html>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
  return;
}



    res.writeHead(200);
    res.end("Bot OKX MS/ES en marxa");
  }).listen(process.env.PORT || 3000);

});

function patternScore(v1, v2, v3, velas, msNow, esNow) {
  let score = 0;

  // 1) Força vela 1
  const body1 = Math.abs(v1.close - v1.open);
  const range1 = v1.high - v1.low;
  if (range1 > 0) {
    const pct1 = body1 / range1;
    if (pct1 >= 0.5) score += 2;
    else if (pct1 >= 0.35) score += 1;
  }

  // 2) Indecisió vela 2
  const body2 = Math.abs(v2.close - v2.open);
  const range2 = v2.high - v2.low;
  if (range2 > 0) {
    const pct2 = body2 / range2;
    if (pct2 <= 0.20) score += 2;
    else if (pct2 <= 0.30) score += 1;
  }

  // 3) Força vela 3
  const body3 = Math.abs(v3.close - v3.open);
  const range3 = v3.high - v3.low;
  if (range3 > 0) {
    const pct3 = body3 / range3;
    if (pct3 >= 0.5) score += 2;
    else if (pct3 >= 0.35) score += 1;
  }

  // 4) Tendència
  if (validTrend(msNow, esNow, v1, v2, v3)) score += 1;

  // 5) Estructura
  if (structureOK(msNow, esNow, velas)) score += 1;

  // 6) Volum + Volatilitat (només v1, v2, v3)
  const volScore = volumeScore3(v1, v2, v3);
  const volaScore = volatilityScore3(v1, v2, v3);

  if (volScore + volaScore >= 2) score += 2;
  else if (volScore + volaScore >= 1) score += 1;

  return score;
}



function volumeScore3(v1, v2, v3) {
  const avgVol = (v1.volume + v2.volume + v3.volume) / 3;

  // Pots ajustar aquests llindars més endavant
  if (avgVol >= 1.5 * v2.volume) return 2; 
  if (avgVol >= 1.0 * v2.volume) return 1;
  return 0;
}

function volatilityScore3(v1, v2, v3) {
  const r1 = v1.high - v1.low;
  const r2 = v2.high - v2.low;
  const r3 = v3.high - v3.low;
  const avgRange = (r1 + r2 + r3) / 3;

  // Llindars simples i mecànics
  if (avgRange >= r2 * 1.5) return 2;
  if (avgRange >= r2 * 1.0) return 1;
  return 0;
}











