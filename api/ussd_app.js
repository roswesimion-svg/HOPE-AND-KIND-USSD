// HOPE and KIND USSD - Vercel version (stateless, uses cumulative INPUT like 1*John)
const { waitUntil } = require('@vercel/functions');

const MPESA_ENV = process.env.MPESA_ENV || 'sandbox'; // 'sandbox' or 'production'
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE = process.env.MPESA_SHORTCODE || '174379';
const PASSKEY = process.env.MPESA_PASSKEY;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const REG_FEE = Number(process.env.REG_FEE || 100);
const TX_TYPE = process.env.MPESA_TX_TYPE || 'CustomerPayBillOnline'; // or CustomerBuyGoodsOnline
const BASE = MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

const MENU = 'CON Welcome to HOPE and KIND. Select an option:\n1. Register\n2. Already a member';

function timestamp() {
  // Vercel runs in UTC; Daraja expects East Africa Time (UTC+3)
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function normalizeMsisdn(m) {
  const d = String(m || '').replace(/\D/g, '');
  if (d.startsWith('254')) return d;
  if (d.startsWith('0')) return '254' + d.slice(1);
  if (d.length === 9) return '254' + d;
  return d;
}

// fetch with a hard timeout and retries on network errors
async function safeFetch(url, opts = {}, timeoutMs = 8000, retries = 1) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (i >= retries) throw e;
    }
  }
}

// cache the OAuth token between warm invocations (valid ~1h)
let tokenCache = { value: null, exp: 0 };
async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const tr = await safeFetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const { access_token } = await tr.json();
  if (!access_token) throw new Error('Could not get M-Pesa token');
  tokenCache = { value: access_token, exp: Date.now() + 50 * 60 * 1000 };
  return access_token;
}

async function stkPush(msisdn, amount) {
  msisdn = normalizeMsisdn(msisdn);
  const access_token = await getToken();

  const ts = timestamp();
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${ts}`).toString('base64');
  const r = await safeFetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: ts,
      TransactionType: TX_TYPE,
      Amount: amount,
      PartyA: msisdn,
      PartyB: SHORTCODE,
      PhoneNumber: msisdn,
      CallBackURL: CALLBACK_URL,
      AccountReference: 'Registration',
      TransactionDesc: 'Registration fee',
    }),
  }, 10000, 1);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  const { MSISDN, INPUT, USSDCODE } = req.query;
  // Dialed code segments (e.g. *814*16#) are ignored if the gateway includes them in INPUT
  const dialSegs = `${USSDCODE || ''}*${process.env.USSD_CODE || '*814*16#'}`
    .replace(/#/g, '').split('*').map((x) => x.trim()).filter(Boolean);
  const parts = String(INPUT || '').replace(/#/g, '').split('*').map((x) => x.trim()).filter(Boolean);
  while (parts.length && dialSegs.includes(parts[0])) parts.shift();

  let out;
  try {
    if (parts.length === 0) {
      out = MENU;
    } else if (parts[0] !== '1' && parts[0] !== '2') {
      out = 'END Invalid option. Please dial again.';
    } else if (parts.length === 1) {
      out = parts[0] === '1'
        ? 'CON Enter your full name:'
        : 'CON You are not a member. Enter your full name to register and pay:';
    } else {
      // Answer the USSD gateway immediately (it times out in a few seconds);
      // the STK push keeps running in the background.
      waitUntil(
        stkPush(MSISDN, REG_FEE)
          .then((r) => {
            if (r.ResponseCode === '0') console.log('STK sent', r.CheckoutRequestID);
            else console.error('STK failed:', JSON.stringify(r));
          })
          .catch((e) => console.error('STK error:', e))
      );
      out = `END Registration fee is KES ${REG_FEE}. Enter your M-Pesa PIN on the prompt that appears shortly.`;
    }
  } catch (e) {
    console.error(e);
    out = 'END Service unavailable. Please try again later.';
  }

  console.log('REQUEST', JSON.stringify(req.query), '->', out.split('\n')[0]);
  res.status(200).send(out);
};
