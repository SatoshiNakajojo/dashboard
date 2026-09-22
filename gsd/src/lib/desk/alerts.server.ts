export async function notify(title: string, body: string) {
  const text = `${title}\n${body}`.slice(0, 3500);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  const ntfy = process.env.NTFY_URL;
  const jobs: Promise<unknown>[] = [];
  if (token && chat) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      }).catch(() => null),
    );
  }
  if (ntfy) {
    jobs.push(
      fetch(ntfy, {
        method: "POST",
        headers: { Title: title, "Content-Type": "text/plain; charset=utf-8" },
        body: text,
      }).catch(() => null),
    );
  }
  if (jobs.length) await Promise.all(jobs);
}

export function alertsConfigured() {
  return Boolean((process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) || process.env.NTFY_URL);
}
