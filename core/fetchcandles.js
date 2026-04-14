export async function fetchAndStoreCandles(symbol, timeframe) {
  try {
    // Bitunix usa intervals en minúscules: 1h, 4h, 1d
    const interval = timeframe.toLowerCase();

    // API_URL ve de Railway i ara serà: https://api.bitunix.com/api/v1/market/kline
    const url = `${API_URL}?symbol=${symbol}&interval=${interval}&limit=4`;

    const res = await axios.get(url);

    if (!res.data || !res.data.data || res.data.data.length === 0) {
      console.log("⚠️ Bitunix no ha retornat dades");
      return;
    }

    const data = res.data.data;

    for (const k of data) {
      // Format Bitunix:
      // [0]=timestamp(ms), [1]=open, [2]=high, [3]=low, [4]=close, [5]=volume
      const rawTs = normalizeTimestamp(parseInt(k[0]));
      if (!rawTs) continue;

      const timestamp = rawTs;

      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);

      // Timestamp en hora espanyola
      const timestamp_es = new Date(
        new Date(timestamp).toLocaleString("en-US", {
          timeZone: "Europe/Madrid"
        })
      ).getTime();

      // Data humana en hora espanyola
      const date_es = new Date(timestamp).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).replace(",", "");

      await client.query(
        `
        INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume, timestamp_es, date_es)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (symbol, timeframe, timestamp)
        DO UPDATE SET
          open=$4, high=$5, low=$6, close=$7, volume=$8,
          timestamp_es=$9, date_es=$10;
        `,
        [
          symbol,
          timeframe,
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          timestamp_es,
          date_es
        ]
      );
    }

    console.log(`✔ Candles Bitunix guardades: ${symbol} ${timeframe}`);

  } catch (err) {
    console.log("❌ Error descarregant vela Bitunix:", symbol, timeframe, err.message);
  }
}
