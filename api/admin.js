// Private payments dashboard.  Open:  https://YOUR-APP/admin?key=YOUR_ADMIN_TOKEN
// CSV download:                        https://YOUR-APP/admin?key=YOUR_ADMIN_TOKEN&format=csv
const crypto = require('crypto');
const { getPool } = require('../lib/db');

const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kes = (n) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function authorized(given) {
  if (!ADMIN_TOKEN) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const key = q.key || (req.headers['x-admin-key'] || '');
  if (!ADMIN_TOKEN) return res.status(503).send('Admin disabled: set ADMIN_TOKEN in the environment variables.');
  if (!authorized(key)) return res.status(401).send('Unauthorized');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const db = getPool();
    const TZ = "'Africa/Nairobi'";

    if (q.format === 'csv') {
      const { rows } = await db.query(
        `SELECT created_at AT TIME ZONE ${TZ} AS created, paid_at AT TIME ZONE ${TZ} AS paid,
                phone, paid_phone, name, amount, status, mpesa_receipt, result_desc
         FROM payments ORDER BY created_at DESC`);
      const head = ['created_eat', 'paid_eat', 'phone', 'paid_phone', 'name', 'amount', 'status', 'mpesa_receipt', 'result_desc'];
      const lines = [head.join(',')].concat(rows.map((r) =>
        [r.created, r.paid, r.phone, r.paid_phone, r.name, r.amount, r.status, r.mpesa_receipt, r.result_desc].map(csvCell).join(',')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
      return res.status(200).send(lines.join('\n'));
    }

    const stats = (await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0)                                   AS total,
         COUNT(*)           FILTER (WHERE status = 'success')                                         AS paid_count,
         COUNT(*)           FILTER (WHERE status = 'pending')                                         AS pending_count,
         COUNT(*)           FILTER (WHERE status = 'failed')                                          AS failed_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'success'
           AND (paid_at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date), 0)             AS today_total,
         COUNT(*)           FILTER (WHERE status = 'success'
           AND (paid_at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date)                 AS today_count
       FROM payments`)).rows[0];
    const contacts = (await db.query('SELECT COUNT(*)::int AS n FROM contacts')).rows[0].n;
    const recent = (await db.query(
      `SELECT to_char(COALESCE(paid_at, created_at) AT TIME ZONE ${TZ}, 'DD Mon HH24:MI') AS at,
              phone, name, amount, status, mpesa_receipt, result_desc
       FROM payments ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 100`)).rows;

    const badge = (s) => `<span class="b ${esc(s)}">${esc(s)}</span>`;
    const rowsHtml = recent.map((r) => `<tr><td>${esc(r.at)}</td><td>${esc(r.phone)}</td><td>${esc(r.name)}</td>
      <td class="n">${esc(Number(r.amount).toLocaleString('en-KE'))}</td><td>${badge(r.status)}</td>
      <td>${esc(r.mpesa_receipt || '')}</td><td class="d">${r.status === 'failed' ? esc(r.result_desc) : ''}</td></tr>`).join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>HOPE and KIND - Payments</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f6f8;color:#1c1f24}
h1{font-size:20px;margin:0 0 12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.c{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 2px #0001}.c small{color:#667;display:block}.c b{font-size:19px}
.wrap{overflow-x:auto;background:#fff;border-radius:10px;box-shadow:0 1px 2px #0001}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #eee;white-space:nowrap}th{background:#fafbfc}.n{text-align:right}.d{color:#a33;white-space:normal}
.b{padding:2px 8px;border-radius:99px;font-size:12px}.success{background:#d9f5e1;color:#0a6b2a}.pending{background:#fff3cd;color:#8a6500}.failed{background:#fde0e0;color:#a31515}
a{color:#0a58ca}
</style></head><body>
<h1>HOPE and KIND - Payments</h1>
<div class="cards">
<div class="c"><small>Total collected</small><b>${kes(stats.total)}</b></div>
<div class="c"><small>Collected today</small><b>${kes(stats.today_total)}</b><small>${esc(stats.today_count)} payments</small></div>
<div class="c"><small>Paid</small><b>${esc(stats.paid_count)}</b></div>
<div class="c"><small>Pending</small><b>${esc(stats.pending_count)}</b></div>
<div class="c"><small>Failed / cancelled</small><b>${esc(stats.failed_count)}</b></div>
<div class="c"><small>People who dialed</small><b>${esc(contacts)}</b></div>
</div>
<p><a href="?key=${encodeURIComponent(key)}&format=csv">Download CSV</a> &middot; <a href="?key=${encodeURIComponent(key)}">Refresh</a> &middot; times are East Africa Time</p>
<div class="wrap"><table><thead><tr><th>When</th><th>Phone</th><th>Name</th><th class="n">KES</th><th>Status</th><th>Receipt</th><th>Reason</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="7">No payments yet</td></tr>'}</tbody></table></div>
</body></html>`);
  } catch (e) {
    console.error('Admin error:', e.message);
    res.status(500).send('Database error: ' + esc(e.message));
  }
};
