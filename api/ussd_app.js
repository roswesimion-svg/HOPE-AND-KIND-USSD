// HOPE and KIND USSD - Vercel version (stateless, uses cumulative INPUT like 1*John)

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
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function stkPush(msisdn, amount) {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const tr = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const tText = await tr.text();
  let tJson = {};
  try { tJson = JSON.parse(tText); } catch (e) {}
  const access_token = tJson.access_token;
  if (!access_token) throw new Error(`M-Pesa token failed: HTTP ${tr.status} body="${tText.slice(0, 200)}" MPESA_ENV=${MPESA_ENV} url=${BASE}`);

  const ts = timestamp();
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${ts}`).toString('base64');
  const r = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
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
  });
  const rText = await r.text();
  try { return JSON.parse(rText); } catch (e) { return { ResponseCode: 'ERR', httpStatus: r.status, raw: rText.slice(0, 200) }; }
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
    // name: either 2nd part of a cumulative path (1*John) or the lone latest input (John)
    let name = null;
    if (parts[0] === '1' || parts[0] === '2') {
      if (parts.length > 1) name = parts[1];
    } else if (parts.length === 1 && /[A-Za-z]/.test(parts[0])) {
      name = parts[0];
    }

    if (parts.length === 0) {
      out = MENU;
    } else if (name) {
      const r = await stkPush(MSISDN, REG_FEE);
      if (r.ResponseCode === '0') {
        out = `END Registration fee is KES ${REG_FEE}. Enter your M-Pesa PIN on the prompt to complete.`;
      } else {
        console.error('STK failed:', r);
        out = 'END Could not start payment. Please try again later.';
      }
    } else if (parts[0] === '1') {
      out = 'CON Enter your full name:';
    } else if (parts[0] === '2') {
      out = 'CON You are not a member. Enter your full name to register and pay:';
    } else {
      out = 'END Invalid option. Please dial again.';
    }
  } catch (e) {
    console.error(e);
    out = 'END Service unavailable. Please try again later.';
  }

  console.log('REQUEST', JSON.stringify(req.query), '->', out.split('\n')[0]);
  res.status(200).send(out);
};
