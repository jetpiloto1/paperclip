import type { TelegramReplyMarkup } from "../types.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

function telegramUrl(method: string): string {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

export async function sendTelegram(
  chatId: number,
  text: string,
  parseMode: "HTML" = "HTML",
  replyMarkup?: TelegramReplyMarkup,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }
    const res = await fetch(telegramUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error(`Telegram API error: ${res.status} ${bodyText}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`Telegram send failed: ${err}`);
    return false;
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
): Promise<boolean> {
  try {
    const res = await fetch(telegramUrl("answerCallbackQuery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Telegram answerCallbackQuery error: ${res.status} ${body}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`Telegram answerCallbackQuery failed: ${err}`);
    return false;
  }
}

export function isBotConfigured(): boolean {
  return !!BOT_TOKEN;
}
