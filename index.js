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

// -------------------------------------------------------------
// DETECTPATTERN (versió TradingView real)
// -------------------------------------------------------------
function detectPattern(velas) {
  if (velas.length < 4) return { msNow: false, esNow: false };

  //const n = velas.length;

  // v1 = vela tancada anterior
  // v2 = última vela tancada
  // v3 = vela actual (igual que TV: c3 = close[1])
  const n = velas.length;
  const v1 = velas[n - 4];
  const v2 = velas[n - 3];
  const v3 = velas[n - 2];



  // strongBull / strongBear / indecision EXACTES com TradingView
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
    return (body / range) <= 0.3; // igual que maxBodyPctIndecision a TV
  };

  // MS / ES EXACTAMENT com TradingView
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

// -------------------------------------------------------------
// CLASSIFYSIGNAL
// -------------------------------------------------------------
function classifySignal(velas) {
  if (velas.length < 4) return null;

  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);
  if (!msNow && !esNow) return null;

  // Igual que TradingView: la vela de senyal és v2 (close[1])
  if (!inWindow(v3.timestamp)) return null;


  const vt = validTrend(msNow, esNow, v1, v2, v3);
  const st = structureOK(msNow, esNow, velas);

  const tipoBase = msNow ? "MS" : "ES";

  // Igual que TradingView: V si compleix context, X si no
  //const tipoVX = (vt && st) ? "V" : "X";
  const tipoVX = "V";


  return { tipoBase, tipoVX, v2 };
}

// -------------------------------------------------------------
// INDICADORS
// -------------------------------------------------------------
function calcVolumeScore(velas) {
  if (velas.length < 10) return 0;

  const last = velas[velas.length - 1].volume;
  const prev = velas.slice(-10, -1).map(v => v.volume);
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;

  if (avg === 0) return 0;

  const ratio = last / avg;
  if (ratio >= 2) return 2;
  if (ratio >= 1.5) return 1.5;
  if (ratio >= 1.2) return 1;
  if (ratio >= 1.0) return 0.5;
  return 0;
}

function calcVolatilityScore(velas) {
  if (velas.length < 10) return 0;

  const ranges = velas.slice(-10).map(v => v.high - v.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;

  const lastRange = velas[velas.length - 1].high - velas[velas.length - 1].low;

  if (avgRange === 0) return 0;

  const ratio = lastRange / avgRange;
  if (ratio >= 2) return 2;
  if (ratio >= 1.5) return 1.5;
  if (ratio >= 1.2) return 1;
  if (ratio >= 1.0) return 0.5;
  return 0;
}

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

async function saveSignal(symbol, timeframe, tipo, entry, timestamp) {
  await client.query(
    `INSERT INTO signals (symbol, timeframe, tipo, entry, timestamp)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (symbol, timeframe, tipo, timestamp) DO NOTHING`,
    [symbol, timeframe, tipo, entry, timestamp]
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

// -------------------------------------------------------------
// DETECCIÓ I ENVIAMENT DE SENYALS PER 30m, 1H i 4H
// -------------------------------------------------------------
async function detectAndSend(symbol, timeframe) {
  const q = await client.query(
    `SELECT open, high, low, close, volume, timestamp
     FROM candles
     WHERE symbol = $1 AND timeframe = $2
     ORDER BY timestamp DESC
     LIMIT 4`,
    [symbol, timeframe]
  );

  const velas = q.rows.reverse();
  if (velas.length < 4) return;

  const signal = classifySignal(velas);
  if (!signal) return;

  const { tipoBase, tipoVX, v2 } = signal;
  if (tipoVX === "X") return;

  const entry = v2.close;
  const tipoFull = `${tipoBase}_${tipoVX}`;

  if (await alreadySent(symbol, timeframe, tipoFull, entry)) return;

  const hora = formatSpainTime(v2.timestamp);
  const arrow = tipoBase === "MS" ? "↑" : "↓";

  const msg =
    `<b>${symbol} ${arrow} ${timeframe}</b>\n` +
    `${hora}`;

  const sent = await sendTelegram(msg);
  if (sent) {
    await saveSignal(symbol, timeframe, tipoFull, entry, v2.timestamp);
    console.log(symbol, `→ SENYAL ${timeframe} ENVIAT:`, tipoFull);
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


// -------------------------------------------------------------
// CRON 1 MINUT
// -------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  try {
    for (const symbol of SYMBOLS) {
      try {
        const candles = await fetchCandles(symbol, "15m");
        if (candles.length === 0) {
          console.log(symbol, "→ sense veles");
          continue;
        }

        await saveCandles(symbol, "15m", candles);

        const signal = classifySignal(candles);
        if (!signal) {
          console.log(symbol, "→ cap senyal");
          continue;
        }

        const { tipoBase, tipoVX, v2 } = signal;

        // Filtrar X si cal
        if (tipoVX === "X") {
          console.log(symbol, "→ senyal X descartada");
          continue;
        }

        const entry = v2.close;
        const { tp, sl } = calcTargets(tipoBase, entry);

        const body2 = Math.abs(v2.close - v2.open);
        const entrySuggested =
          tipoBase === "MS"
            ? v2.close - body2 * 0.30
            : v2.close + body2 * 0.30;

        const { tp: tpSug, sl: slSug } = calcTargets(tipoBase, entrySuggested);

        const volScore = calcVolumeScore(candles);
        const volatScore = calcVolatilityScore(candles);

        const tipoFull = `${tipoBase}_${tipoVX}`;

        if (await alreadySent(symbol, "15m", tipoFull, entry)) {
          console.log(symbol, "→ ja enviat");
          continue;
        }

        const hora = formatSpainTime(v2.timestamp);

        //const msg =
        //  `<b>${symbol} 15m</b>\n` +
        //  `Senyal: <b>${tipoBase} ${tipoVX}</b>\n` +
        //  `Hora: ${hora}\n\n` +
        //  `Entrada: <b>${entry}</b>\n` +
        //  `Entrada suggerida: <b>${entrySuggested.toFixed(6)}</b>\n` +
        //  `TP: <b>${tp}</b> | SL: <b>${sl}</b>\n` +
        //  `TP suggerit: <b>${tpSug}</b> | SL suggerit: <b>${slSug}</b>\n\n` +
        //  `Volum Score: <b>${volScore}</b>\n` +
        //  `Volatilitat Score: <b>${volatScore}</b>`;

        const arrow = tipoBase === "MS" ? "↑" : "↓";
        const msg =
          `<b>${symbol} ${arrow} 15m</b>\n` +
          `${hora}`;

        const sent = await sendTelegram(msg);

        if (sent) {
          await saveSignal(symbol, "15m", tipoFull, entry, v2.timestamp);
          console.log(symbol, "→ SENYAL ENVIAT:", tipoFull);
        } else {
          console.log(symbol, "→ ERROR TELEGRAM, REINTENTARÀ");
        }

      } catch (err) {
        console.error(symbol, "→ ERROR INTERIOR:", err.message);
      }
    }
  } catch (err) {
    console.error("ERROR GLOBAL AL CRON:", err.message);
  }
});


// -------------------------------------------------------------
// CRON MULTI-TIMEFRAME (30m, 1H, 4H) — cada 10 minuts
// -------------------------------------------------------------
cron.schedule("*/10 * * * *", async () => {
  const now = new Date();
  const minute = now.getMinutes();
  const hour = now.getHours();

  for (const symbol of SYMBOLS) {

    // 30m → quan el minut és 0 o 30
    if (minute === 0 || minute === 30) {
      const c30 = await fetchCandles(symbol, "30m");
      if (c30.length > 0) {
        await saveCandles(symbol, "30m", c30);
        await detectAndSend(symbol, "30m");
      }
    }

    // 1H → quan el minut és 0
    if (minute === 0) {
      const c1h = await fetchCandles(symbol, "1H");
      if (c1h.length > 0) {
        await saveCandles(symbol, "1H", c1h);
        await detectAndSend(symbol, "1H");
      }
    }

    // 4H → quan el minut és 0 i l’hora és múltiple de 4
    if (minute === 0 && hour % 4 === 0) {
      const c4h = await fetchCandles(symbol, "4H");
      if (c4h.length > 0) {
        await saveCandles(symbol, "4H", c4h);
        await detectAndSend(symbol, "4H");
      }
    }
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

    for (const symbol of SYMBOLS) {
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

      rows += `
        <tr style="color:${color}">
          <td><b>${symbol}</b></td>
          <td>${ps.v1}</td>
          <td>${ps.v2}</td>
          <td>${ps.MS_possible ? "✔" : "✘"}</td>
          <td>${ps.ES_possible ? "✔" : "✘"}</td>
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
  </head>
  <body>
    <h1>Panell de detecció MS/ES</h1>
    <p><b>Última actualització:</b> ${lastUpdate}</p>

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








