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

  const tipoBase = msNow ? "MS" : "ES";

  return { tipoBase, v3 };
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
// UPDATE CANDLES → Omple globalCache per al panell
// -------------------------------------------------------------
async function updateCandles() {
  for (const symbol of SYMBOLS) {
    try {
      const c15  = await fetchCandles(symbol, "15m");
      const c30  = await fetchCandles(symbol, "30m");
      const c1H  = await fetchCandles(symbol, "1H");
      const c4H  = await fetchCandles(symbol, "4H");

      globalCache["15m"][symbol] = c15;
      globalCache["30m"][symbol] = c30;
      globalCache["1H"][symbol]  = c1H;
      globalCache["4H"][symbol]  = c4H;

    } catch (err) {
      console.log("Error descarregant veles per", symbol, err.message);
    }
  }

  console.log("globalCache actualitzat:", new Date().toISOString());
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

function getRecommendation({ trendPercent, msPercent, volumeOK, gir, operarTendencia, pullbackActiu }) {

  // 🔥 1) Entrada en tendència (igual que indicador v2)
  if (operarTendencia && volumeOK) {
    return "TENDÈNCIA";
  }

  // 🔥 2) MS/ES favorable (igual que indicador v2)
  if (msPercent >= 70 && trendPercent < 40 && volumeOK) {
    return "MS/ES";
  }

  // 🔥 3) Pullback actiu → NO operar
  if (pullbackActiu) {
    return "PULLBACK";
  }

  // 🔥 4) No operar
  return "NO OPERAR";
}


updateCandles(); // primera càrrega immediata
cron.schedule("*/1 * * * *", updateCandles); // cada minut


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
          // 🔥 FIABILITAT EXACTA (TradingView → Bot)
          // ---------------------------------------------------------
          const {
            trendPercent,
            msPercent,
            contextLabel,
            volumeOK,
            tendenciaPrincipal,
            pullbackActiu,
            operarTendencia,
            msNow,
            esNow
          } = calcReliability(candles);

          // ---------------------------------------------------------
          // 🟥 FILTRE GLOBAL — NO OPERAR SI NO HI HA VOLUM
          // ---------------------------------------------------------
          if (!volumeOK) continue;

          // ---------------------------------------------------------
          // 🟦 MS/ES ANTICIPAT (v3 en formació)
          // ---------------------------------------------------------
          const early = detectEarlySignal(candles);

          if (early) {
            const tipoEarly = early.tipo === "MS" ? "EARLY_MS" : "EARLY_ES";
            const timestampEarly = early.v3.timestamp;
            const timestampEsEarly = formatSpainTime(timestampEarly);

            // ❗ Només enviar si MS/ES és realment favorable
            if (msPercent >= 70 && trendPercent < 40) {
              if (!(await alreadySent(symbol, timeframe, tipoEarly, timestampEarly))) {

                if (timeframe === "15m") {
                  await sendTelegram({
                    title: `${symbol} ${early.tipo === "MS" ? "↑" : "↓"} ${timeframe} (EARLY)`,
                    entry: early.entry.toFixed(4),
                    trendPercent,
                    msPercent,
                    contextLabel,
                    extra: timestampEsEarly
                  });
                }

                await saveSignal(symbol, timeframe, tipoEarly, early.entry, timestampEarly, timestampEsEarly);
              }
            }
          }

          // ---------------------------------------------------------
          // 🟩 MS/ES NORMAL (vela 3 tancada)
          // ---------------------------------------------------------
          const signal = classifySignal(candles);
          if (signal) {
            const { tipoBase, v3 } = signal;
            const timestamp = v3.timestamp;
            const timestampEs = formatSpainTime(timestamp);

            if (!(await alreadySent(symbol, timeframe, tipoBase, timestamp))) {

              // ❗ Només enviar si MS/ES és realment favorable
              if (msPercent >= 70 && trendPercent < 40) {

                const body = Math.abs(v3.close - v3.open);
                const retr = body * (RETRACEMENT_PERCENT / 100);

                const entry =
                  tipoBase === "MS"
                    ? v3.close - retr
                    : v3.close + retr;

                const { tp, sl } = calcTargets(tipoBase, entry);

                if (timeframe === "15m") {
                  await sendTelegram({
                    title: `${symbol} ${tipoBase === "MS" ? "↑" : "↓"} ${timeframe}`,
                    direction: tipoBase === "MS" ? "LONG" : "SHORT",
                    entry: entry.toFixed(4),
                    tp: tp.toFixed(4),
                    sl: sl.toFixed(4),
                    trendPercent,
                    msPercent,
                    contextLabel,
                    extra: timestampEs
                  });
                }

                await saveSignal(symbol, timeframe, tipoBase, entry, timestamp, timestampEs);
              }
            }
          }

          // ---------------------------------------------------------
          // 🟢 ENTRADA EN TENDÈNCIA (FIAT)
          // ---------------------------------------------------------
          if (operarTendencia) {

            // ❗ Evitar duplicats
            const lastCandle = candles[candles.length - 1];
            const ts = lastCandle.timestamp;

            if (!(await alreadySent(symbol, timeframe, "TENDENCIA", ts))) {

              const direction = tendenciaPrincipal === "LONG" ? "↑ LONG" : "↓ SHORT";

              if (timeframe === "15m") {
                await sendTelegram({
                  title: `${symbol} ${direction} ${timeframe}`,
                  direction: tendenciaPrincipal,
                  entry: lastCandle.close.toFixed(4),
                  trendPercent,
                  msPercent,
                  contextLabel,
                  extra: formatSpainTime(ts)
                });
              }

              await saveSignal(symbol, timeframe, "TENDENCIA", lastCandle.close, ts, formatSpainTime(ts));
            }
          }

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
// FIABILITAT EXACTA (TradingView v2 → Bot)
// -------------------------------------------------------------
function calcReliability(candles) {
  if (!candles || candles.length < 60) {
    return {
      trendPercent: 0,
      msPercent: 0,
      contextLabel: "Sense dades",
      volumeOK: false,
      tendenciaPrincipal: "CAP",
      pullbackActiu: false,
      operarTendencia: false,
      msNow: false,
      esNow: false
    };
  }

  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // ATR
  let trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const atrNow = trs[trs.length - 1];
  const atrAvg = trs.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const condVolatility = atrNow > atrAvg * 0.8 && atrNow < atrAvg * 1.4;

  // Wicks
  function wickPct(c) {
    const range = c.high - c.low;
    if (range === 0) return 0;
    const upper = c.high - Math.max(c.open, c.close);
    const lower = Math.min(c.open, c.close) - c.low;
    return (upper + lower) / range;
  }
  const avgWick = candles.slice(-20).map(wickPct).reduce((a, b) => a + b, 0) / 20;
  const condWicks = avgWick < 0.40;

  // Volum relatiu
  const volNow = volumes[volumes.length - 1];
  const volAvg = volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const condVolume = volNow > volAvg * 0.6;

  // Swings
  let swingCount = 0;
  for (let i = candles.length - 16; i < candles.length; i++) {
    if (i <= 1) continue;
    const isHigh = highs[i] > highs[i - 1] && highs[i] > highs[i - 2];
    const isLow  = lows[i]  < lows[i - 1] && lows[i]  < lows[i - 2];
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

  // EMA20 / EMA50
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
  const lastClose = closes[closes.length - 1];
  const emaDist = Math.abs(ema20 - ema50) / lastClose;
  const condTrend = emaDist > 0.002 && emaDist < 0.015;

  // TREND PERCENT (igual que indicador)
  let trendScore = 0;
  if (condContinuation) trendScore += 20;
  if (condTrend)        trendScore += 20;
  if (condVolume)       trendScore += 20;
  if (condWicks)        trendScore += 10;
  if (condSwings)       trendScore += 10;
  if (condVolatility)   trendScore += 10;

  const trendStrength =
    emaDist > 0.008 ? 10 :
    emaDist > 0.004 ? 5  :
    0;

  trendScore += trendStrength;
  const trendPercent = Math.min(trendScore, 100);

  // MS/ES PERCENT (igual que indicador)
  let msScore = 0;
  if (condVolume)        msScore += 40;
  if (!condContinuation) msScore += 30;
  if (!condTrend)        msScore += 30;
  const msPercent = Math.min(msScore, 100);

  // MS/ES actuals
  const { msNow, esNow } = detectPattern(candles);

  // TENDÈNCIA PRINCIPAL (igual que indicador)
  let tendenciaPrincipal = "CAP";
  if (ema20 > ema50) tendenciaPrincipal = "LONG";
  if (ema20 < ema50) tendenciaPrincipal = "SHORT";

  // 2 veles contra tendència (igual que indicador v2)
  let velesContra = 0;
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 3];

  if (tendenciaPrincipal === "LONG") {
    if (c1.close < c1.open) velesContra++;
    if (c2.close < c2.open) velesContra++;
  } else if (tendenciaPrincipal === "SHORT") {
    if (c1.close > c1.open) velesContra++;
    if (c2.close > c2.open) velesContra++;
  }

  // PULLBACK INTEL·LIGENT (igual que indicador v2)
  const pullbackActiu =
    (
      (tendenciaPrincipal === "LONG"  && lastClose < ema20) ||
      (tendenciaPrincipal === "SHORT" && lastClose > ema20) ||
      velesContra >= 2 ||
      msPercent > 20
    );

  // OK ENTRAR TENDÈNCIA (igual que indicador v2)
  const operarTendencia =
    tendenciaPrincipal !== "CAP" &&
    !pullbackActiu &&
    trendPercent >= 70 &&
    msPercent < 30 &&
    velesContra < 2;

  // CONTEXT LABEL (pots deixar-ho igual o ajustar-ho després)
  let contextLabel = "Neutre";
  if (trendPercent >= 70 && msPercent < 40)
    contextLabel = "Tendència forta";
  else if (msPercent >= 70 && trendPercent < 40)
    contextLabel = "MS/ES favorable";
  else if (trendPercent < 40 && msPercent < 40)
    contextLabel = "No operar";

  return {
    trendPercent,
    msPercent,
    contextLabel,
    volumeOK: condVolume,
    tendenciaPrincipal,
    pullbackActiu,
    operarTendencia,
    msNow,
    esNow
  };
}

// -------------------------------------------------------------
// GENERATE PANEL BLOCK (FIAT) — amb score per cripto i score global
// -------------------------------------------------------------
async function generatePanelBlock(timeframe, color) {
  const symbols = Object.keys(globalCache[timeframe] || {}).sort();

  let rowsHTML = "";

  for (const symbol of symbols) {
    const velas = globalCache[timeframe][symbol];
    if (!velas || velas.length < 60) continue;

    // 1) Pre-signal (v1, v2, anticipats)
    const ps = preSignal(velas);

    // 2) Fiabilitats exactes (TradingView → Bot → Panell)
    const { trendPercent, msPercent, contextLabel, volumeOK } = calcReliability(velas);
    const vol = volumeOK ? "OK" : "LOW";

    // 3) Formatació
    const v1 = ps.v1 || "-";
    const v2 = ps.v2 || "-";

    const anticipat = ps.earlyTipo ? ps.earlyTipo : "-";
    const entry = ps.earlyEntry ? ps.earlyEntry.toFixed(4) : "-";

    const recom = getRecommendation({
  trendPercent,
  msPercent,
  volumeOK,
  gir: ps.gir,
  operarTendencia,
  pullbackActiu
});


    // 4) Afegim fila
    rowsHTML += `
      <tr>
        <td>${symbol}</td>
        <td>${trendPercent}%</td>
        <td>${msPercent}%</td>
        <td>${contextLabel}</td>
        <td>${v1}</td>
        <td>${v2}</td>
        <td>${ps.gir}</td>
        <td>${vol}</td>
        <td>${anticipat}</td>
        <td>${entry}</td>
        <td>${recom}</td>
      </tr>
    `;
  }

  // HTML final FIAT
  const html = `
    <div class="tf-block" style="border:2px solid ${color}; padding:10px; margin-bottom:20px;">
      <h2 style="color:${color};">Timeframe ${timeframe}</h2>

      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Trend%</th>
            <th>MS/ES%</th>
            <th>Context</th>
            <th>v1</th>
            <th>v2</th>
            <th>Gir</th>
            <th>Volum</th>
            <th>Ant.</th>
            <th>Entr.</th>
            <th>Recom.</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    </div>
  `;

  return { html };
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
    gir: "-",
    earlyTipo: null,
    earlyEntry: null
  };

  const v2 = velas[velas.length - 2];
  const v1 = velas[velas.length - 3];

  const v1Type = isStrongBull(v1.open, v1.high, v1.low, v1.close)
    ? "strBull"
    : isStrongBear(v1.open, v1.high, v1.low, v1.close)
    ? "strBear"
    : isIndecision(v1.open, v1.high, v1.low, v1.close)
    ? "ind"
    : "other";

  const v2Type = isStrongBull(v2.open, v2.high, v2.low, v2.close)
    ? "strBull"
    : isStrongBear(v2.open, v2.high, v2.low, v2.close)
    ? "strBear"
    : isIndecision(v2.open, v2.high, v2.low, v2.close)
    ? "ind"
    : "other";

  const early = detectEarlySignal(velas);

  // 🔥 GIR FIAT
  let gir = "-";
  if (v1Type === "strBear" && v2Type === "ind") gir = "MS";
  if (v1Type === "strBull" && v2Type === "ind") gir = "ES";

  return {
    v1: v1Type,
    v2: v2Type,
    gir,
    earlyTipo: early ? early.tipo : null,
    earlyEntry: early ? early.entry : null
  };
}
// -------------------------------------------------------------
// TELEGRAM (VERSIÓ MILLORADA)
// -------------------------------------------------------------
async function sendTelegram({
  title = "",
  direction = "",
  entry = "",
  tp = "",
  sl = "",
  trendPercent = null,
  msPercent = null,
  contextLabel = "",
  extra = ""
}) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;

  // Construcció del missatge
  let message = "";

  if (title) message += `<b>${title}</b>\n`;
  if (direction) message += `Direcció: <b>${direction}</b>\n`;
  if (entry) message += `Entrada: <b>${entry}</b>\n`;
  if (tp) message += `TP: <b>${tp}</b>\n`;
  if (sl) message += `SL: <b>${sl}</b>\n`;

  // Afegim fiabilitats si existeixen
  if (trendPercent !== null)
    message += `\nFiabilitat Tendència: <b>${trendPercent}%</b>`;
  if (msPercent !== null)
    message += `\nFiabilitat MS/ES: <b>${msPercent}%</b>`;

  // Etiqueta de context
  if (contextLabel)
    message += `\nContext: <b>${contextLabel}</b>`;

  if (extra)
    message += `\n\n${extra}`;

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

