// core/storeCandlesBybit.js

import { client } from "../db/client.js";
import { fetchCandlesBybit } from "./fetchCandlesBybit.js";

export async function storeCandlesBybit(symbol) {
  const candles = await fetchCandlesBybit(symbol);

  for (const c of candles) {
    await client.query(
      `
      INSERT INTO candles2
        (symbol, timeframe, open, high, low, close, volume, timestamp)
      VALUES ($1, '1H', $2, $3, $4, $5, $6, $7)
      ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING
      `,
      [
        symbol,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        c.timestamp
      ]
    );
  }

  return candles;
}
