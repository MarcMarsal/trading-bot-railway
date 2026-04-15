// core/fetchCandlesBybit.js

import axios from "axios";

export async function fetchCandlesBybit(symbol) {
  const cleanSymbol = symbol.replace("-", "").toUpperCase();

  const url = "https://api.bybit.com/v5/market/kline";

  const res = await axios.get(url, {
    params: {
      category: "linear",
      symbol: cleanSymbol,
      interval: "60",   // 1H
      limit: 3          // només 3 veles
    }
  });

  if (!res.data?.result?.list) {
    throw new Error("Resposta Bybit incorrecta");
  }

  const list = res.data.result.list;

  return list.map(c => ({
    timestamp: Number(c[0]),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5]),
  })).reverse(); // més antigues → més noves
}
