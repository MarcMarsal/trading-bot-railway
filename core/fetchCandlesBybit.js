// fetchCandlesBybit.js

import axios from "axios";
import { client } from "../db/client.js";

const BYBIT_URL = process.env.BYBIT_URL;   // 🔥 igual que API_URL
console.log(">>> BYBIT_URL utilitzada:", BYBIT_URL);


export async function fetchAndStoreCandlesBybit(symbol, timeframe) {
  const cleanSymbol = symbol.replace("-", "").toUpperCase();

  try {
    const res = await axios.get(BYBIT_URL, {
      params: {
        symbol: cleanSymbol,
        interval: "60",
        limit: 200
      },
      timeout: 8000
    });

    if (!res.data?.result?.list) {
      console.log(`❌ Resposta incorrecta per ${symbol}`);
      return;
    }

    const list = res.data.result.list;

    const candles = list.map(c => ({
      timestamp: Number(c[0]),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    })).reverse();

    for (const c of candles) {
      await client.query(
        `
        INSERT INTO candles2
          (symbol, timeframe, open, high, low, close, volume, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING
        `,
        [
          symbol,
          timeframe,
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume,
          c.timestamp
        ]
      );
    }

    console.log(`✔ ${symbol} → ${candles.length} veles guardades`);
  } catch (err) {
    console.log(`❌ Error Bybit ${symbol}:`, err.message);
  }
}
