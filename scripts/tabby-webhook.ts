// Registers the Tabby webhook. Usage: npm run tabby:webhook -- https://your-site.com/api/webhooks/tabby
// Uses TABBY_SECRET_KEY, TABBY_MERCHANT_CODE and TABBY_WEBHOOK_SECRET (sent back by Tabby as header X-Auth-Key).
const url = process.argv[2];
const { TABBY_SECRET_KEY, TABBY_MERCHANT_CODE, TABBY_WEBHOOK_SECRET } = process.env;

async function main() {
  if (!url || !/^https:\/\//.test(url)) throw new Error("Pass your public https webhook URL, e.g. https://your-site.com/api/webhooks/tabby");
  if (!TABBY_SECRET_KEY || !TABBY_MERCHANT_CODE || !TABBY_WEBHOOK_SECRET) throw new Error("Set TABBY_SECRET_KEY, TABBY_MERCHANT_CODE and TABBY_WEBHOOK_SECRET in .env.local");
  const res = await fetch("https://api.tabby.ai/api/v1/webhooks", {
    method: "POST",
    headers: { Authorization: `Bearer ${TABBY_SECRET_KEY}`, "X-Merchant-Code": TABBY_MERCHANT_CODE, "Content-Type": "application/json" },
    body: JSON.stringify({ url, header: { title: "X-Auth-Key", value: TABBY_WEBHOOK_SECRET } }),
  });
  console.log(res.status, await res.text());
  if (!res.ok) process.exit(1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
