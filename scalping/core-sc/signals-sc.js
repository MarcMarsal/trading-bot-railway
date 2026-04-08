export async function saveSignal(db, signal) {
  try {
    const timestamp = Date.now();

    const timestamp_es = new Date(timestamp).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).replace(",", "");

    await db.query(
      `
      INSERT INTO signals (symbol, timeframe, tipo, entry, timestamp, timestamp_es)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [
        signal.symbol,
        signal.timeframe,
        signal.side,      // LONG o SHORT
        signal.entry,
        timestamp,
        timestamp_es
      ]
    );

    console.log(`💾 Senyal guardada: ${signal.symbol} ${signal.side}`);

  } catch (err) {
    console.log("❌ Error guardant senyal:", err.message);
  }
}
