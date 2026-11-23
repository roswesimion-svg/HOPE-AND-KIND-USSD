// HOPE and KIND USSD - Vercel version (stateless, uses cumulative INPUT like 1*John)

const { waitUntil } = require('@vercel/functions');
const { Pool } = require('pg');

const env = (name, def = '') => String(process.env[name] || def).trim().replace(/^["']|["']$/g, '').trim();
const MPESA_ENV = env('MPESA_ENV', 'sandbox'); // 'sandbox' or 'production'
const CONSUMER_KEY = env('MPESA_CONSUMER_KEY');
const CONSUMER_SECRET = env('MPESA_CONSUMER_SECRET');
const SHORTCODE = env('MPESA_SHORTCODE', '174379');
const PASSKEY = env('MPESA_PASSKEY');
const CALLBACK_URL = env('MPESA_CALLBACK_URL');
const REG_FEE = Number(env('REG_FEE', '100'));
const TX_TYPE = env('MPESA_TX_TYPE', 'CustomerPayBillOnline'); // or CustomerBuyGoodsOnline
const DATABASE_URL = env('DATABASE_URL'); // postgres://user:password@host:5432/dbname
const PG_SSL = env('PG_SSL', 'false') === 'true'; // set PG_SSL=true if the server requires SSL
const BASE = MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

const MENU = 'CON Welcome to HOPE and KIND. Select an option:\n1. Register\n2. Already a member';

// Postgres: one small pool reused across warm invocations (max 1 so we never flood your friend's server)
let pool = null;
let tableReady = false;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      ssl: PG_SSL ? { rejectUnauthorized: false } : false,
    });
    pool.on('error', (e) => console.error('PG pool error:', e.message));
  }
  return pool;
}

// Save/update a contact (one row per phone number). Never throws: a DB problem must not break registration.
async function saveContact(phone, name) {
  if (!DATABASE_URL) { console.error('DATABASE_URL missing - contact NOT saved'); return; }
  try {
    const db = getPool();
    if (!tableReady) {
      await db.query(`CREATE TABLE IF NOT EXISTS contacts (
        phone TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT DEFAULT 'ussd',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      tableReady = true;
    }
    await db.query(
      `INSERT INTO contacts (phone, name) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [phone, name]
    );
    console.log('Contact saved:', phone);
  } catch (e) {
    console.error('Save contact error:', e.message);
  }
}

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
  if (!access_token) throw new Error(`M-Pesa token failed: HTTP ${tr.status} body="${tText.slice(0, 200)}" MPESA_ENV=${MPESA_ENV} url=${BASE} keyLen=${CONSUMER_KEY.length} secretLen=${CONSUMER_SECRET.length}`);

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
  // Mobile Sasa POSTs form-encoded fields (Vercel parses them into req.body)
  const data = { ...(req.query || {}), ...(req.body || {}) };
  const MSISDN = data.phoneNumber || data.MSISDN;
  const INPUT = data.text ?? data.INPUT ?? '';

  // `text` is already only what was typed after your extension, e.g. "1*John"
  const parts = String(INPUT).replace(/#/g, '').split('*').map((x) => x.trim()).filter(Boolean);

  let out;
  let pushAfter = false;
  let name = '';
  try {
    // text looks like: "1" -> "1*John Doe"
    const choice = parts[0];
    const rawName = parts[1] || '';
    name = rawName.replace(/[^\p{L}\p{M}' .-]/gu, '').trim().slice(0, 100);

    if (parts.length === 0) {
      out = MENU;
    } else if (choice !== '1' && choice !== '2') {
      out = 'END Invalid option. Please dial again.';
    } else if (parts.length === 1) {
      out = choice === '1'
        ? 'CON Enter your full name:'
        : 'CON You are not a member. Enter your full name to register and pay:';
    } else if (name.length < 2) {
      out = 'END Invalid name. Please dial again.';
    } else {
      out = `END Registration fee is KES ${REG_FEE}. Enter your M-Pesa PIN on the prompt to complete.`;
      pushAfter = true;
    }
  } catch (e) {
    console.error(e);
    out = 'END Service unavailable. Please try again later.';
  }

  console.log('REQUEST', JSON.stringify(data), '->', out.split('\n')[0]);
  res.status(200).send(out);

  if (pushAfter) {
    waitUntil((async () => {
      await saveContact(MSISDN, name);
      await new Promise((r) => setTimeout(r, 1500)); // let the USSD session close on the phone
      try {
        const r = await stkPush(MSISDN, REG_FEE);
        if (r.ResponseCode === '0') console.log('STK sent to', MSISDN);
        else console.error('STK failed:', r);
      } catch (e) {
        console.error('STK error:', e.message);
      }
    })());
  }
};
