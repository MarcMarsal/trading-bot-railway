// telegram/send.js
import axios from "axios";

export async function sendTelegram({
  title = "",
  direction = "",
  entry = "",
  tp = "",
  sl = "",
  trendPercent = null,
  msPercent = null,
  contextLabel = "",
  extra = ""
}) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;

  let message = "";

  if (title) message += `<b>${title}</b>\n`;
  if (direction) message += `Direcció: <b>${direction}</b>\n`;
  if (entry) message += `Entrada: <b>${entry}</b>\n`;
  if (tp) message += `TP: <b>${tp}</b>\n`;
  if (sl) message += `SL: <b>${sl}</b>\n`;

  if (trendPercent !== null)
    message += `\nFiabilitat Tendència: <b>${trendPercent}%</b>`;
  if (msPercent !== null)
    message += `\nFiabilitat MS/ES: <b>${msPercent}%</b>`;

  if (contextLabel)
    message += `\nContext: <b>${contextLabel}</b>`;

  if (extra)
    message += `\n\n${extra}`;

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
