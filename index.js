import axios from "axios";
import cron from "node-cron";
import db from "./db.js";

const SYMBOLS = ["BTC-USDT", "SUI-USDT", "SOL-USDT", "XRP-USDT","AVAX-USDT","APT-USDT","INJ-USDT","SEI-USDT"];

async function fetchCandles(symbol, interval) {
  const url = `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=${interval}&limit=3`;
  const res = await axios.get(url);
  return res.data.data.reverse().map(k => ({
    timestamp: parseInt(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

function saveCandles(symbol, interval, candles) {
  const stmt = db.prepare(`
    INSERT INTO candles (symbol, interval, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  candles.forEach(c => {
    stmt.run(symbol, interval, c.timestamp, c.open, c.high, c.low, c.close, c.volume);
  });

  stmt.finalize();
}

// Cada minut → 5m
cron.schedule("* * * * *", async () => {
  for (const symbol of SYMBOLS) {
    const candles = await fetchCandles(symbol, "5m");
    saveCandles(symbol, "5m", candles);
  }
});

// Cada hora → 1H
cron.schedule("2 * * * *", async () => {
  for (const symbol of SYMBOLS) {
    const candles = await fetchCandles(symbol, "1H");
    saveCandles(symbol, "1H", candles);
  }
});

console.log("Bot en marxa a Railway…");
