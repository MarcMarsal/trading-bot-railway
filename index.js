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
  "SEI-USDT"
];

const API_URL = "https://www.okx.com/api/v5/market/candles";

// -------------------------------------------------------------
// FUNCIONS BASE (1:1 lògica TV)
// -------------------------------------------------------------
const strongBodyPct = 0.5;          // ara mateix vols 0.5
const minStrongRange = 0.0;
const maxBodyPctIndecision = 0.3;
const minRangeIndecision = 0.0;

function body(o, c) { return Math.abs(c - o); }
function range(h, l) { return h - l; }

function bodyPct(o, h, l, c) {
  const r = range(h, l);
  return r === 0 ? 0 : body(o, c) / r;
}

function isBull(o, c) { return c > o; }
function isBear(o, c) { return c < o; }

function isStrongBull(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  const rng = range(h, l);
  const rngPct = (rng / c) * 100;
  return bp >= strongBodyPct && (minStrongRange <= 0 || rngPct >= minStrongRange) && isBull(o, c);
}

function isStrongBear(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  const rng = range(h, l);
  const rngPct = (rng / c) * 100;
  return bp >= strongBodyPct && (minStrongRange <= 0 || rngPct >= minStrongRange) && isBear(o, c);
}

function isIndecision(o, h, l, c) {
  const bp = bodyPct(o, h, l, c);
  const rng = range(h, l);
  const rngPct = (rng / c) * 100;
  return bp <= maxBodyPctIndecision && (minRangeIndecision <= 0 || rngPct >= minRangeIndecision);
}

// -------------------------------------------------------------
// DETECTPATTERN (mateixes 3 veles que TV)
// -------------------------------------------------------------
function detectPattern(velas) {
  if (velas.length < 4) return { msNow: false, esNow: false };

  const n = velas.length;

  const v1 = velas[n - 3]; // o[3]
  const v2 = velas[n - 2]; // o[2]
  const v3 = velas[n - 1]; // o[1]

  const bull1 = v1.close > v1.open;
  const bear1 = v1.close < v1.open;

  const indecision2 = isIndecision(v2.open, v2.high, v2.low, v2.close);

  const strongBull3 = isStrongBull(v3.open, v3.high, v3.low, v3.close);
  const strongBear3 = isStrongBear(v3.open, v3.high, v3.low, v3.close);

  const msNow = bear1 && indecision2 && strongBull3;
  const esNow = bull1 && indecision2 && strongBear3;

  return { msNow, esNow, v1, v2, v3 };
}


// -------------------------------------------------------------
// VALIDTREND (igual que TV, però només per marcar V/X)
// -------------------------------------------------------------
function validTrend(msNow, esNow, v1, v2, v3) {
  const mid1 = (v1.open + v1.close) / 2;

  const msTrend = msNow && v2.low < v1.low && v3.close > mid1;
  const esTrend = esNow && v2.high > v1.high && v3.close < mid1;

  return msTrend || esTrend;
}

// -------------------------------------------------------------
// PIVOTS + STRUCTUREOK (igual que TV, però només per V/X)
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
// INWINDOW (mateix concepte que TV: 1 setmana)
// -------------------------------------------------------------
function inWindow(openTime) {
  const now = Date.now();
  const periodMinutes = 10080;
  const startTime = now - periodMinutes * 60000;
  return openTime >= startTime;
}

// -------------------------------------------------------------
// CLASSIFYSIGNAL — COM TV: patró + finestra; vt/st només marquen V/X
// -------------------------------------------------------------
function classifySignal(velas) {
  if (velas.length < 4) return null;

  const { msNow, esNow, v1, v2, v3 } = detectPattern(velas);
  if (!msNow && !esNow) return null;

  if (!inWindow(v3.timestamp)) return null;

  const vt = validTrend(msNow, esNow, v1, v2, v3);
  const st = structureOK(msNow, esNow, velas);

  const tipoBase = msNow ? "MS" : "ES";
  const tipoVX = (vt && st) ? "V" : "X"; // NO bloqueja, només etiqueta

  return { tipoBase, tipoVX, v3 };
}

// -------------------------------------------------------------
// INDICADORS (volum / volatilitat, només informatius)
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
// ANTI-DUPLICATS (POSTGRES)
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
  const url = `${API_URL}?instId=${symbol}&bar=${interval}&limit=100`;

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
// SAVE CANDLES (POSTGRES) — UPSERT
// -------------------------------------------------------------
async function saveCandles(symbol, timeframe, candles) {
  for (const c of candles) {
    await client.query(
      `INSERT INTO candles (symbol, timeframe, open, high, low, close, volume, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (symbol, timeframe, timestamp)
       DO UPDATE SET
         open = EXCLUDED.open,
         high = EXCLUDED.high,
         low = EXCLUDED.low,
         close = EXCLUDED.close,
         volume = EXCLUDED.volume`,
      [symbol, timeframe, c.open, c.high, c.low, c.close, c.volume, c.timestamp]
    );
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
    await axios.post(url, payload);
  } catch (e) {
    console.error("Error enviant Telegram:", e.message);
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

// -------------------------------------------------------------
// CRON 5 MINUTS
// -------------------------------------------------------------
cron.schedule("*/5 * * * *", async () => {
  for (const symbol of SYMBOLS) {
    const candles = await fetchCandles(symbol, "5m");
    if (candles.length === 0) continue;

    await saveCandles(symbol, "5m", candles);

    const signal = classifySignal(candles);
    if (!signal) continue;

    const { tipoBase, tipoVX, v3 } = signal;

    const entry = v3.close;
    const { tp, sl } = calcTargets(tipoBase, entry);

    const body3 = Math.abs(v3.close - v3.open);
    const entrySuggested =
      tipoBase === "MS"
        ? v3.close - body3 * 0.30
        : v3.close + body3 * 0.30;

    const { tp: tpSug, sl: slSug } = calcTargets(tipoBase, entrySuggested);

    const volScore = calcVolumeScore(candles);
    const volatScore = calcVolatilityScore(candles);

    const tipoFull = `${tipoBase}_${tipoVX}`;

    if (await alreadySent(symbol, "5m", tipoFull, entry)) continue;

    const hora = formatSpainTime(v3.timestamp);

    const msg =
      `<b>${symbol} 5m</b>\n` +
      `Senyal: <b>${tipoBase} ${tipoVX}</b>\n` +
      `Hora: ${hora}\n\n` +
      `Entrada: <b>${entry}</b>\n` +
      `Entrada suggerida: <b>${entrySuggested.toFixed(6)}</b>\n` +
      `TP: <b>${tp}</b> | SL: <b>${sl}</b>\n` +
      `TP suggerit: <b>${tpSug}</b> | SL suggerit: <b>${slSug}</b>\n\n` +
      `Volum Score: <b>${volScore}</b>\n` +
      `Volatilitat Score: <b>${volatScore}</b>`;

    await sendTelegram(msg);
    await saveSignal(symbol, "5m", tipoFull, entry, v3.timestamp);

    console.log(symbol, "→ SENYAL ENVIAT:", tipoFull);
  }
});

// -------------------------------------------------------------
// CRON 1H
// -------------------------------------------------------------
cron.schedule("2 * * * *", async () => {
  for (const symbol of SYMBOLS) {
    const candles = await fetchCandles(symbol, "1H");
    if (candles.length === 0) continue;

    await saveCandles(symbol, "1H", candles);
  }
});

console.log("BOT VERSION 3 — Railway OK, UPSERT actiu");

// -------------------------------------------------------------
// KEEP-ALIVE
// -------------------------------------------------------------
setInterval(() => {}, 1000 * 60 * 60);

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot OKX MS/ES en marxa");
}).listen(process.env.PORT || 3000);

console.log("Servidor keep-alive actiu");

// -------------------------------------------------------------
// INIT DB
// -------------------------------------------------------------
initDB();
