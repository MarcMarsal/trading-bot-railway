// core/fetchCandlesBybit.js

import axios from "axios";

export async function fetchCandlesBybit(symbol) {
  const cleanSymbol = symbol.replace("-", "").toUpperCase();

  //const url = "https://api.bybitglobal.com/v5/market/kline";
  //const url = "https://rapid-truth-481a.marc-marsal.workers.dev";
const url = "https://perceptive-nourishment-production-a767.up.railway.app";

console.log("URL utilitzada:", url);

  const res = await axios.get(url, {
    params: {
  symbol: cleanSymbol,
  interval: "60",
  limit: 3
}

    ,
    timeout: 8000
  });
console.log("Resposta del Worker:", JSON.stringify(res.data, null, 2));

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
  })).reverse();
}
