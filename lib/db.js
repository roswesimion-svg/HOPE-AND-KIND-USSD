// Shared Postgres helpers. Tables come from migrations/ (run: npm run migrate).
const { Pool } = require('pg');

const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();
const DATABASE_URL = clean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DB_URL);
const PG_SSL = clean(process.env.PG_SSL) === 'true';

let pool = null;
function getPool() {
  if (!pool) {
    const ssl = PG_SSL ? { rejectUnauthorized: false } : false;
    pool = new Pool({
      ...(DATABASE_URL ? { connectionString: DATABASE_URL } : {}),
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      ssl,
    });
    pool.on('error', (e) => console.error('PG pool error:', e.message));
  }
  return pool;
}

// Save/update a contact (one row per phone number). Never throws.
async function saveContact(phone, name) {
  try {
    await getPool().query(
      `INSERT INTO contacts (phone, name) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [phone, name]
    );
    console.log('Contact saved:', phone);
  } catch (e) {
    console.error('Save contact error:', e.message);
  }
}

// Called right after M-Pesa accepts the STK push: remember it as "pending".
async function recordPending({ checkoutRequestId, merchantRequestId, phone, name, amount }) {
  try {
    await getPool().query(
      `INSERT INTO payments (checkout_request_id, merchant_request_id, phone, name, amount, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (checkout_request_id) DO UPDATE
         SET merchant_request_id = EXCLUDED.merchant_request_id,
             name = COALESCE(payments.name, EXCLUDED.name)`,
      [checkoutRequestId, merchantRequestId || null, phone, name, amount]
    );
    console.log('Payment pending:', checkoutRequestId, phone, amount);
  } catch (e) {
    console.error('Record pending error:', e.message);
  }
}

// Called by the M-Pesa callback with the final result. Works even if the pending row is missing.
async function recordResult({ checkoutRequestId, merchantRequestId, resultCode, resultDesc, amount, receipt, paidPhone }) {
  const ok = Number(resultCode) === 0;
  try {
    await getPool().query(
      `INSERT INTO payments (checkout_request_id, merchant_request_id, phone, amount, status,
                             mpesa_receipt, paid_phone, result_code, result_desc, paid_at)
       VALUES ($1, $2, COALESCE($7, 'unknown'), COALESCE($3, 0), $4, $5, $7, $6, $8, CASE WHEN $4 = 'success' THEN now() END)
       ON CONFLICT (checkout_request_id) DO UPDATE SET
         status        = EXCLUDED.status,
         amount        = CASE WHEN EXCLUDED.status = 'success' THEN EXCLUDED.amount ELSE payments.amount END,
         mpesa_receipt = EXCLUDED.mpesa_receipt,
         paid_phone    = EXCLUDED.paid_phone,
         result_code   = EXCLUDED.result_code,
         result_desc   = EXCLUDED.result_desc,
         paid_at       = EXCLUDED.paid_at`,
      [checkoutRequestId, merchantRequestId || null, amount ?? null, ok ? 'success' : 'failed',
       receipt || null, Number(resultCode), paidPhone || null, String(resultDesc || '').slice(0, 300)]
    );
    console.log(`Payment ${ok ? 'SUCCESS' : 'FAILED'}:`, checkoutRequestId, amount, receipt);
  } catch (e) {
    console.error('Record result error:', e.message);
  }
}

module.exports = { getPool, saveContact, recordPending, recordResult };
