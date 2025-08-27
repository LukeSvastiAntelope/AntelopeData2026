// Helper: minimal Telegram send API wrapper
export async function telegramSendMessage(botToken: string, chatId: string | number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const body: any = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (replyMarkup) body.reply_markup = replyMarkup
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`sendMessage failed: ${res.status} ${t}`)
  }
  return res.json()
}


