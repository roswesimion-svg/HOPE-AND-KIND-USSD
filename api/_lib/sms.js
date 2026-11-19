// Africa's Talking SMS via plain HTTPS (no SDK needed)
const USERNAME = () => process.env.AT_USERNAME || 'sandbox';
const API_KEY = () => process.env.AT_API_KEY;
const SENDER = () => process.env.AT_SENDER_ID; // optional; must be approved by AT
const URL_ = () =>
  USERNAME() === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

// phones: array like ['2547...']; returns { sent, failed, errors }
async function sendSms(phones, message) {
  if (!API_KEY()) throw new Error('AT_API_KEY not set');
  const unique = [...new Set(phones)].map((p) => '+' + p.replace(/^\+/, ''));
  let sent = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const body = new URLSearchParams({ username: USERNAME(), to: chunk.join(','), message });
    if (SENDER()) body.set('from', SENDER());
    const r = await fetch(URL_(), {
      method: 'POST',
      headers: {
        apiKey: API_KEY(),
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!r.ok || !data) {
      failed += chunk.length;
      errors.push(`HTTP ${r.status}: ${text.slice(0, 200)}`);
      continue;
    }
    for (const rec of (data.SMSMessageData && data.SMSMessageData.Recipients) || []) {
      if (rec.statusCode === 100 || rec.statusCode === 101 || rec.statusCode === 102) sent++;
      else { failed++; errors.push(`${rec.number}: ${rec.status}`); }
    }
  }
  return { sent, failed, errors: errors.slice(0, 5) };
}

module.exports = { sendSms };
