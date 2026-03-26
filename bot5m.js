const cron = require("node-cron");
const { fetchCandles, saveCandles } = require("./candles");
const { detectEarlySignal } = require("./patterns");
const { applyFilters } = require("./filters");
const { sendTelegram } = require("./telegram");
const { alreadySent5m, saveSignal5m } = require("./db/signals5m");
const { formatSpainTime } = require("./utils/time");

const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTER-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

const RETRACEMENT_PERCENT = 20;

// -------------------------------------------------------------
// BOT DE 5 MINUTS
// -------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  console.log("Executant bot 5m...");

  for (const symbol of SYMBOLS) {
    try {
      const timeframe = "5m";

      // 1) OBTENIR CANDLES
      const candles = await fetchCandles(symbol, timeframe);
      if (!candles || candles.length < 3) continue;

      // 2) GUARDAR CANDLES (ara amb timestamp_es i date_es)
      await saveCandles(symbol, timeframe, candles);

      // 3) FILTRE DE MINUT 3 (evitar EARLY massa aviat)
      const minute = new Date().getUTCMinutes() % 5;
      if (minute < 3) {
        // massa aviat per confiar en una EARLY
        continue;
      }

      // ---------------------------------------------------------
      // 🔵 EARLY SIGNAL — EXACTAMENT COM EL BOT DE 15m
      // ---------------------------------------------------------
      const early = detectEarlySignal(candles);

      if (early) {
        const tipoEarly = early.tipo === "MS" ? "EARLY_MS" : "EARLY_ES";
        const timestampEarly = early.v3.timestamp;
        const timestampEsEarly = formatSpainTime(timestampEarly);

        const exists = await alreadySent5m(symbol, timeframe, tipoEarly, timestampEarly);
        if (!exists) {

          // 🔥 Calcular entrada EXACTAMENT com el bot de 15m
          const body = Math.abs(early.v3.close - early.v3.open);
          const retr = body * (RETRACEMENT_PERCENT / 100);

          const entry =
            early.tipo === "MS"
              ? early.v3.close - retr
              : early.v3.close + retr;

          // 🔥 Enviar debug a Telegram (només per 5m)
          const debugMsg =
            `<b>${symbol} 5m (EARLY)</b>\n` +
            `${tipoEarly}\n` +
            `Entrada: ${entry.toFixed(4)}\n` +
            `${timestampEsEarly}`;

          await sendTelegram(debugMsg);

          // 🔥 Guardar sempre (NOT NULL)
          await saveSignal5m(
            symbol,
            timeframe,
            tipoEarly,
            entry,
            timestampEarly,
            timestampEsEarly
          );

          console.log(symbol, "→ EARLY guardada amb entrada", entry.toFixed(4));
        }
      }

    } catch (err) {
      console.error(`Error processant ${symbol} 5m:`, err.message);
    }
  }
});
