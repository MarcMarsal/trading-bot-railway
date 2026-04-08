import axios from "axios";

const API_URL = process.env.API_URL;

// Validació robusta del timestamp (en mil·lisegons)
function normalizeTimestamp(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  if (raw === 0) return null;
  if (raw < 1600000000000) return null; // ms (2020+)
  return raw;
}

// -------------------------------------------------------------
// FETCH CANDLES (sense guardar a DB, només retornem)
// -------------------------------------------------------------
export async function getCandlesSc(symbol, timeframe = "5m", limit = 21) {
  try {
    const url = `${API_URL}?instId=${symbol}&bar=${timeframe}&limit=${limit}`; 
    const res = await axios.get(url);
    const data = res.data.data;

    if (!data || data.length === 0) return [];

    const candles = data
      .map(k => {
        const rawTs = normalizeTimestamp(parseInt(k[0])) ?? Date.now();

        return {
          timestamp: rawTs,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        };
      })
      .reverse(); // OKX envia DESC → ho invertim

     // 🟩 IMPORTANT: eliminar la vela oberta
    candles.pop();
    return candles;

  } catch (err) {
    console.log("❌ Error descarregant veles:", symbol, timeframe, err.message);
    return [];
  }
}
