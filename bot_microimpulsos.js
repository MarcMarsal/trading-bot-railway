// bot_microimpulsos.js

import cron from "node-cron";
import axios from "axios";
import { initDB } from "./db/client.js";
import prisma from "./db/client.js";
import { classifySignal, calcTargets } from "./core/microimpulse.js";
import { calcReliability } from "./core/reliability.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { sendTelegram } from "./telegram/send.js";
import { formatSpainTime } from "./core/utils.js";
import { detectMicroimpulse } from "./core/microimpulse2.js";

// -------------------------------------------------------------
// CONFIGURACIÓ
// -------------------------------------------------------------
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
// VALIDACIÓ ROBUSTA DEL TIMESTAMP
// -------------------------------------------------------------
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000) return null; // només timestamps reals (2020+)
  return raw;
}

// -------------------------------------------------------------
// FETCH + STORE CANDLES (OPTIMITZAT)
// -------------------------------------------------------------
async function fetchAndStoreCandles(symbol, interval) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${interval}&limit=1`;

    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return;

    const k = data[0];

    const rawTs =
      normalizeTimestamp(parseInt(k[0])) ??
      Date.now();

    const timestamp = Math.floor(rawTs / 1000);

    const candle = {
      symbol,
      interval,
      timestamp,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    };

    await prisma.candles.upsert({
      where: {
        symbol_interval_timestamp: {
          symbol,
          interval,
          timestamp
        }
      },
      update: candle,
      create: candle
    });

    console.log(`Stored ${symbol} ${interval} @ ${timestamp}`);

  } catch (err) {
    console.log("Error descarregant vela:", symbol, interval, err.message);
  }
}

// -------------------------------------------------------------
// GET CANDLES DES DE DB (SUBSTITUEIX getCandles ANTIC)
// -------------------------------------------------------------
async function getCandlesFromDB(symbol, interval, limit = 120) {
  return prisma.candles.findMany({
    where: { symbol, interval },
    orderBy: { timestamp: "desc" },
    take: limit
  }).then(rows => rows.reverse());
}

// -------------------------------------------------------------
// MICROIMPULSOS 2.0 — FLUX PRINCIPAL
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 120);
  if (!candles || candles.length < 60) return;

  // 1) Fiabilitat exacta
  const {
    trendPercent,
    msPercent,
    contextLabel,
    volumeOK,
    msNow,
    esNow
  } = calcReliability(candles);

  // 1.5) Microimpulsos reals
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

  // 2) MS/ES normal
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
// LOOP PRINCIPAL (SUBSTITUEIX CRON ANTIC)
// -------------------------------------------------------------
async function mainLoop() {
  console.log("Tick microimpulsos:", new Date().toISOString());

  // 1) Recollir veles
  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      await fetchAndStoreCandles(symbol, timeframe);
    }
  }

  // 2) Processar senyals
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
  console.log("Bot Microimpulsos 2.0 en marxa (amb recollida de veles integrada)");

  // Executar cada minut
  cron.schedule("* * * * *", mainLoop);
}

startBot();
