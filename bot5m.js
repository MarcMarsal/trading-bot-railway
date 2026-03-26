const cron = require("node-cron");
const { fetchCandles, saveCandles } = require("./core/candles");
const { detectEarlySignal, classifySignal } = require("./core/signals");
const { formatSpainTime } = require("./core/utils");
const { saveSignal5m, alreadySent5m } = require("./db/signals5m");
const { sendTelegram } = require("./telegram/send");

// Criptos OKX
const SYMBOLS = [
  "BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT", "AVAX-USDT",
  "APT-USDT", "INJ-USDT", "SEI-USDT", "ADA-USDT", "LINK-USDT",
  "BNB-USDT", "ETH-USDT", "NEAR-USDT", "HBAR-USDT", "RENDER-USDT",
  "ASTR-USDT", "BCH-USDT", "VIRTUAL-USDT"
];

// -------------------------------------------------------------
// FILTRES (de moment buits — mode debug)
// -------------------------------------------------------------
function applyFilters(candles, signal) {
  return {
    ok: true,
    reason: null
  };
}

// -------------------------------------------------------------
// BOT DE 5 MINUTS — MODE DEBUG
// -------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  console.log("Executant bot 5m...");

  for (const symbol of SYMBOLS) {
    try {
      const timeframe = "5m";

      // 1) OBTENIR CANDLES
      const candles = await fetchCandles(symbol, timeframe);
      if (!candles || candles.length < 3) continue;

      await saveCandles(symbol, timeframe, candles);

      // ---------------------------------------------------------
      // 🔵 EARLY SIGNAL
      // ---------------------------------------------------------
      const early = detectEarlySignal(candles);

      if (early) {
        const tipoEarly = early.tipo === "MS" ? "EARLY_MS" : "EARLY_ES";
        const timestampEarly = early.v3.timestamp;
        const timestampEsEarly = formatSpainTime(timestampEarly);

        const exists = await alreadySent5m(symbol, timeframe, tipoEarly, timestampEarly);
        if (!exists) {
          const result = applyFilters(candles, early);

          let debugMsg =
            `<b>${symbol} 5m (EARLY)</b>\n` +
            `${tipoEarly}\n` +
            (result.ok ? "correcte" : `descartada per: ${result.reason}`);

          await sendTelegram(debugMsg);

          if (result.ok) {
            await saveSignal5m(
              symbol,
              timeframe,
              tipoEarly,
              early.entry,
              timestampEarly,
              timestampEsEarly
            );
          }

          console.log(symbol, "→ EARLY processada");
        }
      }

      // ---------------------------------------------------------
      // 🟢 NORMAL SIGNAL
      // ---------------------------------------------------------
      const signal = classifySignal(candles);
      if (!signal) continue;

      const { tipoBase, v3 } = signal;
      const timestamp = v3.timestamp;
      const timestampEs = formatSpainTime(timestamp);

      const existsNormal = await alreadySent5m(symbol, timeframe, tipoBase, timestamp);
      if (existsNormal) continue;

      // Entrada amb retracement del 20%
      const body = Math.abs(v3.close - v3.open);
      const retr = body * 0.2;

      const entry =
        tipoBase === "MS"
          ? v3.close - retr
          : v3.close + retr;

      const result = applyFilters(candles, signal);

      let debugMsg =
        `<b>${symbol} 5m</b>\n` +
        `${tipoBase}\n` +
        (result.ok ? "correcte" : `descartada per: ${result.reason}`);

      await sendTelegram(debugMsg);

      if (result.ok) {
        await saveSignal5m(
          symbol,
          timeframe,
          tipoBase,
          entry,
          timestamp,
          timestampEs
        );
      }

      console.log(symbol, "→ NORMAL processada");

    } catch (err) {
      console.error("Error processant", symbol, err.message);
    }
  }
});
