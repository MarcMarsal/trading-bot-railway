// bot_microimpulsos.js

import cron from "node-cron";
import { initDB } from "./db/client.js";
import { getCandles } from "./core/candles.js";
import { classifySignal, calcTargets } from "./core/microimpulse.js";
import { calcReliability } from "./core/reliability.js";
import { alreadySent2 } from "./db/alreadySent2.js";
import { saveSignal2 } from "./db/saveSignal2.js";
import { sendTelegram } from "./telegram/send.js";
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
const RETRACEMENT_PERCENT = 15;

// -------------------------------------------------------------
// MICROIMPULSOS 2.0 — FLUX PRINCIPAL
// -------------------------------------------------------------
async function processSymbol(symbol, timeframe) {
  const candles = await getCandles(symbol, timeframe, 120);
  if (!candles || candles.length < 60) return;

  // 1) Fiabilitat exacta (igual que indicador)
  const {
    trendPercent,
    msPercent,
    contextLabel,
    volumeOK,
    msNow,
    esNow
  } = calcReliability(candles);

  // 2) MS/ES normal (vela 3 tancada)
  const signal = classifySignal(candles);
  if (!signal) return;

  const { tipoBase, v3 } = signal;
  const timestamp = v3.timestamp;
  const timestampEs = formatSpainTime(timestamp);

  // 3) Anti-duplicats
  if (await alreadySent2(symbol, timeframe, tipoBase, timestamp)) return;

  // 4) Filtre de fiabilitat (igual que bot antic)
  if (!(msPercent >= 60 && trendPercent < 60)) return;

  // 5) Càlcul d'entrada amb retracement
  const body = Math.abs(v3.close - v3.open);
  const retr = body * (RETRACEMENT_PERCENT / 100);

  const entry =
    tipoBase === "MS"
      ? v3.close - retr
      : v3.close + retr;

  const { tp, sl } = calcTargets(tipoBase, entry);

  // 6) Guardar a DB
  await saveSignal2({
    symbol,
    timeframe,
    type: tipoBase,
    entry,
    timestamp,
    reason: "microimpulse",
    sensitivity: msPercent
  });

  // 7) Enviar Telegram (només 15m si vols)
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
// CRON PRINCIPAL
// -------------------------------------------------------------
async function startBot() {
  await initDB();
  console.log("Bot Microimpulsos 2.0 en marxa");

  cron.schedule("* * * * *", async () => {
    console.log("Tick microimpulsos:", new Date().toISOString());

    for (const symbol of SYMBOLS) {
      for (const timeframe of TIMEFRAMES) {
        try {
          await processSymbol(symbol, timeframe);
        } catch (err) {
          console.error("Error processant", symbol, timeframe, err.message);
        }
      }
    }
  });
}

startBot();
