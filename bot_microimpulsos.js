// bot_microimpulsos.js

import cron from "node-cron";
import axios from "axios";
import { client, initDB } from "./db/client.js";
import { classifySignal, calcTargets } from "./core/microimpulse.js";
import { calcReliability } from "./core/reliability.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { sendTelegram } from "./telegram/send.js";
import { formatSpainTime } from "./core/utils.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";

const API_URL = process.env.API_URL;

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const TIMEFRAMES = ["15m", "30m", "1H", "4H"];
const RETRACEMENT_PERCENT = 15;

// -------------------------------------------------------------
// VALIDACIÓ TIMESTAMP
// -------------------------------------------------------------
function normalizeTimestamp(raw) {
  if (!raw || typeof raw !== "number") return null;
  if (raw < 1600000000) return null;
  return raw;
}

// -------------------------------------------------------------
// FETCH + STORE (PG, limit=1)
// -------------------------------------------------------------
async function fetchAndStoreCandles(symbol, interval) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${interval}&limit=1`;
    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return;

    const k = data[0];
    const rawTs = normalizeTimestamp(parseInt(k[0])) ?? Date.now();
    const timestamp = Math.floor(rawTs / 1000);

    const open = parseFloat(k[1]);
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);
    const close = parseFloat(k[4]);
    const volume = parseFloat(k[5]);

    await client.query(
      `
      INSERT INTO candles (symbol, interval, timestamp, open, high, low, close, volume)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (symbol, interval, timestamp)
      DO UPDATE SET open=$4, high=$5, low=$6, close=$7, volume=$8;
      `,
      [symbol, interval, timestamp, open, high, low, close, volume]
    );

    console.log(`Stored ${symbol} ${interval} @ ${timestamp}`);

  } catch (err) {
    console.log("Error descarregant vela:", symbol, interval, err.message);
  }
}

// -------------------------------------------------------------
// GET CANDLES FROM DB (PG)
// -------------------------------------------------------------
async function getCandlesFromDB(symbol, interval, limit = 120) {
  const res = await client.query(
    `
    SELECT *
    FROM candles
    WHERE symbol = $1 AND interval = $2
    ORDER BY timestamp DESC
    LIMIT $3
    `,
    [symbol, interval, limit]
  );

  return res.rows.reverse();
}

// -------------------------------------------------------------
// MICROIMPULSOS 2.0
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 120);
  if (!candles || candles.length < 60) return;

  const {
    trendPercent,
    msPercent,
    contextLabel,
    volumeOK,
    msNow,
    esNow
  } = calcReliability(candles);

  const micro = detectMicroimpulse(candles, {
    trendPercent,
    msPercent,
    contextLabel,
    volumeOK,
    msNow,
    esNow,
    trendLabel: msNow ? "LONG" : esNow ? "SHORT" : "LONG"
  }, symbol, timeframe);

  if (micro) {
    if (!(await alreadySent2(symbol, timeframe, micro.type, micro.timestamp))) {

      await saveSignal2({
        symbol,
        timeframe,
        type: micro.type,
        entry: micro.entry,
        timestamp: Math.floor(micro.timestamp / 1000),
        reason: "microimpulse",
        sensitivity: micro.reliability ?? msPercent
      });

      if (timeframe === "15m") {
        await sendTelegram({
          title: `${symbol} ${micro.type.includes("LONG") ? "↑" : "↓"} ${timeframe}`,
          direction: micro.type.includes("LONG") ? "LONG" : "SHORT",
          entry: micro.entry.toFixed(4),
          tp: "-",
          sl: "-",
          trendPercent,
          msPercent,
          contextLabel,
          extra: formatSpainTime(Math.floor(micro.timestamp / 1000))
        });
      }

      console.log(`Microimpuls REAL detectat: ${symbol} ${timeframe} → ${micro.type}`);
    }
  }

  const signal = classifySignal(candles);
  if (!signal) return;

  const { tipoBase, v3 } = signal;
  const timestamp = v3.timestamp;
  const timestampEs = formatSpainTime(timestamp);

  if (await alreadySent2(symbol, timeframe, tipoBase, timestamp)) return;
  if (!(msPercent >= 60 && trendPercent < 60)) return;

  const body = Math.abs(v3.close - v3.open);
  const retr = body * (RETRACEMENT_PERCENT / 100);

  const entry =
    tipoBase === "MS"
      ? v3.close - retr
      : v3.close + retr;

  const { tp, sl } = calcTargets(tipoBase, entry);

  await saveSignal2({
    symbol,
    timeframe,
    type: tipoBase,
    entry,
    timestamp,
    reason: "microimpulse",
    sensitivity: msPercent
  });

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

  console.log(`Microimpuls detectat: ${symbol} ${timeframe} → ${tipoBase}`);
}

// -------------------------------------------------------------
// LOOP PRINCIPAL
// -------------------------------------------------------------
async function mainLoop() {
  console.log("Tick microimpulsos:", new Date().toISOString());

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        await processSymbol(symbol, timeframe);
      } catch (err) {
        console.error("Error processant", symbol, timeframe, err.message);
      }
    }
  }
}

// -------------------------------------------------------------
// START BOT
// -------------------------------------------------------------
async function startBot() {
  await initDB();
  console.log("Bot Microimpulsos 2.0 en marxa (PG + recollida integrada)");
  cron.schedule("* * * * *", mainLoop);
}

startBot();
