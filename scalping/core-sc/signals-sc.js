export async function saveSignal(db, signal) {
  try {
    await db.query(
      `
      INSERT INTO signals (symbol, timeframe, side, entry, tp, sl, timestamp)
      VALUES ($1,$2,$3,$4,$5,$6, NOW())
      `,
      [
        signal.symbol,
        signal.timeframe,
        signal.side,
        signal.entry,
        signal.tp,
        signal.sl
      ]
    );
  } catch (err) {
    console.log("❌ Error guardant senyal:", err.message);
  }
}
