async function processSymbol(symbol, timeframe) {
  const candles = await getCandlesFromDB(symbol, timeframe, 62);
  if (!candles || candles.length < 60) return;

  // 1) ALERTA TEMPRANA (intravela)
  const early = detectMicroimpulseEarly(candles, symbol, timeframe);
  if (early) {
    const tsSecEarly = Math.floor(early.timestamp / 1000);
    const alreadyEarly = await alreadySent2(symbol, timeframe, early.type, tsSecEarly, "early");
    if (!alreadyEarly) {
      await saveSignal2({
        symbol,
        timeframe,
        type: early.type,
        entry: early.entry,
        timestamp: early.timestamp,
        reason: early.reason,
        sensitivity: early.sensitivity,
        status: "early",
      });
      console.log(`Microimpuls EARLY: ${symbol} ${timeframe} → ${early.type}`);
    }
  }

  // 2) CONFIRMAT (vela tancada)
  if (candles.length < 61) return;
  const closedCandles = candles.slice(0, -1);
  const micro = detectMicroimpulse(closedCandles, symbol, timeframe);
  if (micro) {
    const tsSec = Math.floor(micro.timestamp / 1000);
    const already = await alreadySent2(symbol, timeframe, micro.type, tsSec, "confirmed");
    if (!already) {
      await saveSignal2({
        symbol,
        timeframe,
        type: micro.type,
        entry: micro.entry,
        timestamp: micro.timestamp,
        reason: micro.reason,
        sensitivity: micro.sensitivity,
        status: "confirmed",
      });

      console.log(`Microimpuls CONFIRMED: ${symbol} ${timeframe} → ${micro.type}`);
    }
  }

  // 3) MS / ES
  const mses = detectMSES(candles, symbol, timeframe);
  if (mses) {
    const tsSecMSES = Math.floor(mses.timestamp / 1000);
    const alreadyMSES = await alreadySent2(symbol, timeframe, mses.type, tsSecMSES, "mses");

    if (!alreadyMSES) {
      await saveSignal2({
        symbol,
        timeframe,
        type: mses.type,
        entry: mses.entry,   // 🔥 FIAT: MAI null
        timestamp: mses.timestamp,
        reason: mses.reason,
        sensitivity: 50,
        status: "mses",
      });

      console.log(`MSES DETECTED: ${symbol} ${timeframe} → ${mses.type}`);
    }
  }
}
