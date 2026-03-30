// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import axios from "axios";
import cron from "node-cron";
import { Client } from "pg";
import http from "http";

// -------------------------------------------------------------
// GLOBAL CACHE (FIAT) — necessari per al panell
// -------------------------------------------------------------
global.globalCache = global.globalCache || {
  "15m": {},
  "30m": {},
  "1H": {},
  "4H": {}
};

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
      timestamp_es BIGINT,
      PRIMARY KEY (symbol, timeframe, tipo, timestamp)
    );
  `);

  console.log("PostgreSQL OK — Taules creades amb PK");
}

// -------------------------------------------------------------
// CONFIGURACIÓ
// -------------------------------------------------------------
const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const RETRACEMENT_PERCENT = 15;
const API_URL = "https://www.okx.com/api/v5/market/candles";

// -------------------------------------------------------------
// FUNCIONS BASE (igual que TradingView)
// -------------------------------------------------------------
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
  return bp >= 0.5 && isBull(o, c);
}

function isStrongBear(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  return bp >= 0.5 && isBear(o, c);
}

function isIndecision(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  return bp <= 0.3;
}

// -------------------------------------------------------------
// DETECCIÓ MS/ES (patró 3 veles)
// -------------------------------------------------------------
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
  const idx = velas.length - 3;
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
  const idx = velas.length - 3;
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
// VALIDACIÓ DE VELA COMPLETA
// -------------------------------------------------------------
function velaCompleta(v) {
  return (
    v &&
    v.open != null &&
    v.close != null &&
    v.high != null &&
    v.low != null &&
    v.timestamp != null
  );
}

// -------------------------------------------------------------
// CALCULAR TANCAMENT DE VELA
// -------------------------------------------------------------
function calcCloseTimestamp(openTs, timeframe) {
  const tfMap = {
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1H": 60 * 60 * 1000,
    "4H": 4 * 60 * 1000 * 60
  };
  return openTs + tfMap[timeframe];
}

// -------------------------------------------------------------
// CLASSIFY SIGNAL (MS / ES)
// -------------------------------------------------------------
function classifySignal(velas) {
  if (!velas || velas.length < 4) return null;

  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);

  if (!v1 || !v2 || !v3) return null;
  if (!v3.close || !v3.open || !v3.timestamp) return null;

  if (!msNow && !esNow) return null;

  const vt = validTrend(msNow, esNow, v1, v2, v3);
  const st = structureOK(msNow, esNow, velas);

  const tipoBase = msNow ? "MS" : "ES";
  const tipoVX = "V";

  const score = patternScore(v1, v2, v3, velas, msNow, esNow);

  return { tipoBase, tipoVX, v2, v3, score, vt, st };
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
async function alreadySent(symbol, timeframe, tipo, timestamp) {
  const q = await client.query(
    `SELECT 1 FROM signals
     WHERE symbol = $1
       AND timeframe = $2
       AND tipo = $3
       AND timestamp = $4
     LIMIT 1`,
    [symbol, timeframe, tipo, timestamp]
  );

  return q.rowCount > 0;
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

// -------------------------------------------------------------
// DETECCIÓ I ENVIAMENT (VERSIÓ ANTIGA — NO S’USA)
// -------------------------------------------------------------
async function detectAndSend(symbol, timeframe) {
  return;
}

// -------------------------------------------------------------
// CRON PRINCIPAL (AMB DETECCIÓ ANTICIPADA)
// -------------------------------------------------------------
// -------------------------------------------------------------
// CRON PRINCIPAL (SINCRONITZAT AMB EL PANELL)
// -------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  try {
    for (const symbol of SYMBOLS) {
      for (const timeframe of ["15m", "30m", "1H", "4H"]) {
        try {
          const candles = await fetchCandles(symbol, timeframe);
          if (!candles || candles.length < 3) continue;

          await saveCandles(symbol, timeframe, candles);

          // ---------------------------------------------------------
          // 🔵 ALERTA TEMPRANA — EXACTAMENT COM EL PANELL
          // ---------------------------------------------------------
          const early = detectEarlySignal(candles);

         if (early) {
  const tipoEarly = early.tipo === "MS" ? "EARLY_MS" : "EARLY_ES";
  const timestampEarly = early.v3.timestamp;
  const timestampEsEarly = formatSpainTime(timestampEarly);

  if (!(await alreadySent(symbol, timeframe, tipoEarly, timestampEarly))) {

    const arrow = early.tipo === "MS" ? "↑" : "↓";
    const msgEarly =
      `<b>${symbol} ${arrow} ${timeframe} (EARLY)</b>\n` +
      `${timestampEsEarly}`;

    // 🔵 Només enviar a Telegram si és 15m
    if (timeframe === "15m") {
      await sendTelegram(msgEarly);
    }

    // 🟢 Guardar sempre
    await saveSignal(symbol, timeframe, tipoEarly, early.entry, timestampEarly, timestampEsEarly);
    console.log(symbol, timeframe, "→ EARLY guardada (Telegram només si 15m)");
  }
}


          // ---------------------------------------------------------
          // 🟢 ALERTA NORMAL (vela 3 tancada)
          // ---------------------------------------------------------
          const signal = classifySignal(candles);
if (!signal) continue;

const { tipoBase, v3: v3closed } = signal;
const tipoNormal = tipoBase;

const timestamp = v3closed.timestamp;
const timestampEs = formatSpainTime(timestamp);

if (await alreadySent(symbol, timeframe, tipoNormal, timestamp)) continue;

const body = Math.abs(v3closed.close - v3closed.open);
const retr = body * (RETRACEMENT_PERCENT / 100);
const entry = tipoNormal === "MS"
  ? v3closed.close - retr
  : v3closed.close + retr;

const arrow = tipoNormal === "MS" ? "↑" : "↓";
const msg =
  `<b>${symbol} ${arrow} ${timeframe}</b>\n` +
  `${entry.toFixed(4)}\n` +
  `${timestampEs}`;

// 🔵 Només enviar a Telegram si és 15m
if (timeframe === "15m") {
  await sendTelegram(msg);
}

// 🟢 Guardar sempre
await saveSignal(symbol, timeframe, tipoNormal, v3closed.close, timestamp, timestampEs);
console.log(symbol, timeframe, "→ NORMAL guardada (Telegram només si 15m)");


        } catch (err) {
          console.error(symbol, timeframe, "→ ERROR INTERIOR:", err.message);
        }
      }
    }
  } catch (err) {
    console.error("ERROR GLOBAL AL CRON:", err.message);
  }
});

// -------------------------------------------------------------
// MARKET SCORE (Opció A — complet 6/6)
// -------------------------------------------------------------
function calcMarketScore(candles) {
  if (!candles || candles.length < 60) return 0;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // ATR aproximat
  let trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i] - closes[i-1])
    ));
  }
  const atrNow = trs[trs.length - 1];
  const atrAvg = trs.slice(-50).reduce((a,b)=>a+b,0) / 50;
  const condVolatility = atrNow > atrAvg * 0.8 && atrNow < atrAvg * 1.4;

  // Wicks
  function wickPct(c) {
    const range = c.high - c.low;
    if (range === 0) return 0;
    const upper = c.high - Math.max(c.open, c.close);
    const lower = Math.min(c.open, c.close) - c.low;
    return (upper + lower) / range;
  }
  const avgWick = candles.slice(-20).map(wickPct).reduce((a,b)=>a+b,0) / 20;
  const condWicks = avgWick < 0.40;

  // Volum relatiu
  const volNow = volumes[volumes.length - 1];
  const volAvg = volumes.slice(-50).reduce((a,b)=>a+b,0) / 50;
  const condVolume = volNow > volAvg * 0.6;

  // Swings
  let swingCount = 0;
  for (let i = candles.length - 16; i < candles.length; i++) {
    if (i <= 1) continue;
    const isHigh = highs[i] > highs[i-1] && highs[i] > highs[i-2];
    const isLow  = lows[i] < lows[i-1] && lows[i] < lows[i-2];
    if (isHigh || isLow) swingCount++;
  }
  const condSwings = swingCount >= 3;

  // Continuació
  let hasContinuation = false;
  for (let i = candles.length - 11; i < candles.length - 1; i++) {
    const cont = Math.abs(closes[i] - candles[i].open) / candles[i].open;
    if (cont > 0.0025) hasContinuation = true;
  }
  const condContinuation = hasContinuation;

  // Tendència (EMA20 vs EMA50)
  function ema(arr, period) {
    const k = 2 / (period + 1);
    let e = arr[0];
    for (let i = 1; i < arr.length; i++) {
      e = arr[i] * k + e * (1 - k);
    }
    return e;
  }
  const ema20 = ema(closes.slice(-60), 20);
  const ema50 = ema(closes.slice(-60), 50);
  const emaDist = Math.abs(ema20 - ema50) / closes[closes.length - 1];
  const condTrend = emaDist > 0.002 && emaDist < 0.015;

  // Score final
  return [
    condVolatility,
    condWicks,
    condVolume,
    condSwings,
    condContinuation,
    condTrend
  ].filter(Boolean).length;
}

// -------------------------------------------------------------
// GENERATE PANEL BLOCK (FIAT) — amb score per cripto i score global
// -------------------------------------------------------------
async function generatePanelBlock(timeframe, color) {
  const symbols = Object.keys(globalCache[timeframe] || {}).sort(); // ordre alfabètic

  let rowsHTML = "";
  let scores = [];

  for (const symbol of symbols) {
    const velas = globalCache[timeframe][symbol];
    if (!velas || velas.length < 3) continue;

    // 1) Pre-signal (v1, v2, MS, ES, anticipats)
    const ps = preSignal(velas);

    // 2) Market score per cripto (0–6)
    const score = calcMarketScore(velas);
    scores.push(score);

    // 3) Formatació
    const v1 = ps.v1 || "-";
    const v2 = ps.v2 || "-";

    const MS = ps.MS_possible ? "✓" : "✗";
    const ES = ps.ES_possible ? "✓" : "✗";

    const anticipat = ps.earlyTipo ? ps.earlyTipo : "-";
    const entry = ps.earlyEntry ? ps.earlyEntry.toFixed(4) : "-";

    // 4) Afegim fila
    rowsHTML += `
      <tr>
        <td>${symbol}</td>
        <td>${score}/6</td>
        <td>${v1}</td>
        <td>${v2}</td>
        <td>${MS}</td>
        <td>${ES}</td>
        <td>${anticipat}</td>
        <td>${entry}</td>
      </tr>
    `;
  }

  // 5) Score global del timeframe (mitjana)
  const avgScore = scores.length > 0
    ? (scores.reduce((a,b)=>a+b,0) / scores.length)
    : 0;

  const avgFormatted = avgScore.toFixed(1);

  // 6) HTML final del bloc
  const html = `
    <div class="tf-block" style="border:2px solid ${color}; padding:10px; margin-bottom:20px;">
      <h2 style="color:${color};">Timeframe ${timeframe} (${avgFormatted}/6)</h2>

      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Score</th>
            <th>v1</th>
            <th>v2</th>
            <th>Possible MS</th>
            <th>Possible ES</th>
            <th>Anticipat</th>
            <th>Entrada anticipada</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    </div>
  `;

  return { html, score: avgScore };
}

// -------------------------------------------------------------
// SERVIDOR HTTP + PANELL HTML
// -------------------------------------------------------------
initDB().then(() => {
  console.log("DB OK — arrencant servidor HTTP");

  http.createServer(async (req, res) => {

    if (req.url === "/panel") {

      const lastUpdate = formatSpainTime(Date.now());

     const block15m = await generatePanelBlock("15m", "#00ff00");
const block30m = await generatePanelBlock("30m", "#00ffff");
const block1H  = await generatePanelBlock("1H",  "#ffff00");
const block4H  = await generatePanelBlock("4H",  "#ffa500");

// 🔥 Layout final amb files i columnes (ara amb .html)
const htmlBlocks = `
  <div class="row">
    <div class="col-50">${block15m.html}</div>
    <div class="col-50">${block30m.html}</div>
  </div>

  <div class="row">
    <div class="col-50">${block1H.html}</div>
    <div class="col-50">${block4H.html}</div>
  </div>
`;



      // 🔥 HTML complet
      const html = `
      <html>
      <head>
        <meta http-equiv="refresh" content="60">
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

          /* 🔥 Layout 2 columnes */
          .row {
            display: flex;
            gap: 20px;
            margin-bottom: 40px;
          }
          .col-50 {
            width: 50%;
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
          Mostrar només parells amb ✔ o anticipats
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

    // Resposta per defecte
    res.writeHead(200);
    res.end("Bot OKX MS/ES en marxa");
  }).listen(process.env.PORT || 3000);

});


// -------------------------------------------------------------
// SCORE DEL PATRÓ (0–10)
// -------------------------------------------------------------
function patternScore(v1, v2, v3, velas, msNow, esNow) {
  let score = 0;

  const body1 = Math.abs(v1.close - v1.open);
  const range1 = v1.high - v1.low;
  if (range1 > 0) {
    const pct1 = body1 / range1;
    if (pct1 >= 0.5) score += 2;
    else if (pct1 >= 0.35) score += 1;
  }

  const body2 = Math.abs(v2.close - v2.open);
  const range2 = v2.high - v2.low;
  if (range2 > 0) {
    const pct2 = body2 / range2;
    if (pct2 <= 0.20) score += 2;
    else if (pct2 <= 0.30) score += 1;
  }

  const body3 = Math.abs(v3.close - v3.open);
  const range3 = v3.high - v3.low;
  if (range3 > 0) {
    const pct3 = body3 / range3;
    if (pct3 >= 0.5) score += 2;
    else if (pct3 >= 0.35) score += 1;
  }

  if (validTrend(msNow, esNow, v1, v2, v3)) score += 1;
  if (structureOK(msNow, esNow, velas)) score += 1;

  const volScore = volumeScore3(v1, v2, v3);
  const volaScore = volatilityScore3(v1, v2, v3);

  if (volScore + volaScore >= 2) score += 2;
  else if (volScore + volaScore >= 1) score += 1;

  return score;
}

// -------------------------------------------------------------
// SCORE DE VOLUM (3 veles)
// -------------------------------------------------------------
function volumeScore3(v1, v2, v3) {
  const avgVol = (v1.volume + v2.volume + v3.volume) / 3;

  if (avgVol >= 1.5 * v2.volume) return 2;
  if (avgVol >= 1.0 * v2.volume) return 1;
  return 0;
}

// -------------------------------------------------------------
// SCORE DE VOLATILITAT (3 veles)
// -------------------------------------------------------------
function volatilityScore3(v1, v2, v3) {
  const r1 = v1.high - v1.low;
  const r2 = v2.high - v2.low;
  const r3 = v3.high - v3.low;
  const avgRange = (r1 + r2 + r3) / 3;

  if (avgRange >= r2 * 1.5) return 2;
  if (avgRange >= r2 * 1.0) return 1;
  return 0;
}

// -------------------------------------------------------------
// DETECCIÓ ANTICIPADA (v3 en formació)
// -------------------------------------------------------------
function detectEarlySignal(velas) {
  if (!velas || velas.length < 3) return null;

  const v1 = velas[velas.length - 3];
  const v2 = velas[velas.length - 2];
  const v3 = velas[velas.length - 1];

  
  if (!velaCompleta(v1) || !velaCompleta(v2)) return null;
  // v3 pot estar en formació

  
  const v1Bull = isStrongBull(v1.open, v1.high, v1.low, v1.close);
  const v1Bear = isStrongBear(v1.open, v1.high, v1.low, v1.close);
  const v2Ind = isIndecision(v2.open, v2.high, v2.low, v2.close);

  if (!v2Ind) return null;

  const body3 = Math.abs(v3.close - v3.open);
  const range3 = v3.high - v3.low;
  if (range3 === 0) return null;

  const strong3 = (body3 / range3) >= 0.5;
  const mid1 = (v1.open + v1.close) / 2;

  // MS anticipat
  if (
    v1Bear &&
    strong3 &&
    v3.close > v3.open &&
    v3.close > v2.high &&
    v3.close > mid1
  ) {
    return { tipo: "MS", entry: v3.close, v1, v2, v3 };
  }

  // ES anticipat
  if (
    v1Bull &&
    strong3 &&
    v3.close < v3.open &&
    v3.close < v2.low &&
    v3.close < mid1
  ) {
    return { tipo: "ES", entry: v3.close, v1, v2, v3 };
  }

  return null;
}

// -------------------------------------------------------------
// PRESIGNAL (per al panell)
// -------------------------------------------------------------
function preSignal(velas) {
  if (velas.length < 3) return {
    v1: "-",
    v2: "-",
    MS_possible: false,
    ES_possible: false,
    earlyTipo: null,
    earlyEntry: null
  };

  const v2 = velas[velas.length - 2];
  const v1 = velas[velas.length - 3];

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

  const early = detectEarlySignal(velas);

  return {
    v1: v1Type,
    v2: v2Type,
    MS_possible: v1Type === "strongBear" && v2Type === "indecision",
    ES_possible: v1Type === "strongBull" && v2Type === "indecision",
    earlyTipo: early ? early.tipo : null,
    earlyEntry: early ? early.entry : null
  };
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
    return res.status === 200;
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

