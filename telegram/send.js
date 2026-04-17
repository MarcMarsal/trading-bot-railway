// telegram/send.js
import axios from "axios";

export async function sendTelegram({
  symbol = "",
  signalType = "",
  entry = "",
  tp = "",
  sl = ""
}) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;

  let message = "";

  if (symbol) message += `<b>${symbol}</b>\n`;
  if (signalType) message += `Tipus: <b>${signalType}</b>\n`;
  if (entry) message += `Entrada: <b>${entry}</b>\n`;
  if (tp) message += `TP: <b>${tp}</b>\n`;
  if (sl) message += `SL: <b>${sl}</b>\n`;

  const payload = {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML"
  };

  try {
    const res = await axios.post(url, payload);
    return res.status === 200;
  } catch (e) {
    console.error("Error enviant Telegram:", e.message);
    return false;
  }
}
