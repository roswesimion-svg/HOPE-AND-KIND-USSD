// Private payments dashboard.
//   https://YOUR-APP/admin?key=YOUR_ADMIN_TOKEN
//   add &from=2026-11-23T08:00&to=2026-11-23T17:30  to check a date/time range (East Africa Time)
//   add &format=csv to download the same range as a spreadsheet
const crypto = require('crypto');
const { getPool } = require('../lib/db');

const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
const TZ = "'Africa/Nairobi'";
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kes = (n) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function authorized(given) {
  if (!ADMIN_TOKEN) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// "YYYY-MM-DDTHH:MM" strings in East Africa Time (UTC+3, no daylight saving)
function eatNow() { return new Date(Date.now() + 3 * 3600e3); }
const fmt = (d) => d.toISOString().slice(0, 16);
function presets() {
  const n = eatNow();
  const day = (d) => fmt(d).slice(0, 10);
  const today = day(n);
  const yest = day(new Date(n.getTime() - 86400e3));
  const weekAgo = day(new Date(n.getTime() - 6 * 86400e3));
  const month = today.slice(0, 8) + '01';
  return [
    ['Today', `${today}T00:00`, `${today}T23:59`],
    ['Yesterday', `${yest}T00:00`, `${yest}T23:59`],
    ['Last 7 days', `${weekAgo}T00:00`, `${today}T23:59`],
    ['This month', `${month}T00:00`, `${today}T23:59`],
  ];
}

// Payment time = when it was paid (or when it was started, if never paid). Range is inclusive, EAT.
const WHEN = 'COALESCE(paid_at, created_at)';
const RANGE = `($1::timestamp IS NULL OR ${WHEN} >= ($1::timestamp AT TIME ZONE ${TZ}))
           AND ($2::timestamp IS NULL OR ${WHEN} <  (($2::timestamp + interval '1 minute') AT TIME ZONE ${TZ}))`;

module.exports = async (req, res) => {
  const q = req.query || {};
  const key = q.key || (req.headers['x-admin-key'] || '');
  if (!ADMIN_TOKEN) return res.status(503).send('Admin disabled: set ADMIN_TOKEN in the environment variables.');
  if (!authorized(key)) return res.status(401).send('Unauthorized');
  res.setHeader('Cache-Control', 'no-store');

  const from = DT.test(q.from || '') ? q.from : null;
  const to = DT.test(q.to || '') ? q.to : null;
  const params = [from, to];
  const qs = `key=${encodeURIComponent(key)}` + (from ? `&from=${encodeURIComponent(from)}` : '') + (to ? `&to=${encodeURIComponent(to)}` : '');

  try {
    const db = getPool();

    if (q.format === 'csv') {
      const { rows } = await db.query(
        `SELECT created_at AT TIME ZONE ${TZ} AS created, paid_at AT TIME ZONE ${TZ} AS paid,
                phone, paid_phone, name, amount, status, mpesa_receipt, result_desc
         FROM payments WHERE ${RANGE} ORDER BY ${WHEN} DESC`, params);
      const head = ['created_eat', 'paid_eat', 'phone', 'paid_phone', 'name', 'amount', 'status', 'mpesa_receipt', 'result_desc'];
      const lines = [head.join(',')].concat(rows.map((r) =>
        [r.created, r.paid, r.phone, r.paid_phone, r.name, r.amount, r.status, r.mpesa_receipt, r.result_desc].map(csvCell).join(',')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
      return res.status(200).send(lines.join('\n'));
    }

    const stats = (await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS total,
         COUNT(*) FILTER (WHERE status = 'success') AS paid_count,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE status = 'failed')  AS failed_count
       FROM payments WHERE ${RANGE}`, params)).rows[0];
    const todayStats = (await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM payments
       WHERE status = 'success' AND (paid_at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date`)).rows[0];
    const contacts = (await db.query('SELECT COUNT(*)::int AS n FROM contacts')).rows[0].n;
    const recent = (await db.query(
      `SELECT to_char(${WHEN} AT TIME ZONE ${TZ}, 'DD Mon HH24:MI') AS at,
              phone, name, amount, status, mpesa_receipt, result_desc
       FROM payments WHERE ${RANGE} ORDER BY ${WHEN} DESC LIMIT 200`, params)).rows;

    const badge = (s) => `<span class="b ${esc(s)}">${esc(s)}</span>`;
    const rowsHtml = recent.map((r) => `<tr><td>${esc(r.at)}</td><td>${esc(r.phone)}</td><td>${esc(r.name)}</td>
      <td class="n">${esc(Number(r.amount).toLocaleString('en-KE'))}</td><td>${badge(r.status)}</td>
      <td>${esc(r.mpesa_receipt || '')}</td><td class="d">${r.status === 'failed' ? esc(r.result_desc) : ''}</td></tr>`).join('');
    const label = from || to ? `${esc(from ? from.replace('T', ' ') : 'the beginning')} to ${esc(to ? to.replace('T', ' ') : 'now')}` : 'all time';
    const presetLinks = presets().map(([n, f, t]) =>
      `<a class="chip" href="?key=${encodeURIComponent(key)}&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}">${n}</a>`).join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>HOPE and KIND - Payments</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f6f8;color:#1c1f24}
h1{font-size:20px;margin:0 0 12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0 16px}
.c{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 2px #0001}.c small{color:#667;display:block}.c b{font-size:19px}
.c.main{background:#0b5cd5;color:#fff}.c.main small{color:#dbe7ff}.c.main b{font-size:24px}
form{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 2px #0001;display:flex;flex-wrap:wrap;gap:10px;align-items:end}
label{font-size:12px;color:#556;display:flex;flex-direction:column;gap:3px}input{font:inherit;padding:6px;border:1px solid #ccd;border-radius:6px}
button{font:inherit;padding:8px 14px;border:0;border-radius:6px;background:#0b5cd5;color:#fff;cursor:pointer}
.chips{margin:10px 0}.chip{display:inline-block;padding:5px 11px;margin:0 6px 6px 0;border-radius:99px;background:#e6edf9;text-decoration:none;font-size:13px}
.wrap{overflow-x:auto;background:#fff;border-radius:10px;box-shadow:0 1px 2px #0001}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #eee;white-space:nowrap}th{background:#fafbfc}.n{text-align:right}.d{color:#a33;white-space:normal}
.b{padding:2px 8px;border-radius:99px;font-size:12px}.success{background:#d9f5e1;color:#0a6b2a}.pending{background:#fff3cd;color:#8a6500}.failed{background:#fde0e0;color:#a31515}
a{color:#0a58ca}p{font-size:13px;color:#556}
</style></head><body>
<h1>HOPE and KIND - Payments</h1>
<form method="get">
  <input type="hidden" name="key" value="${esc(key)}">
  <label>From (date and time)<input type="datetime-local" name="from" value="${esc(from || '')}"></label>
  <label>To (date and time)<input type="datetime-local" name="to" value="${esc(to || '')}"></label>
  <button type="submit">Check balance</button>
  <a href="?key=${encodeURIComponent(key)}">Clear</a>
</form>
<div class="chips">${presetLinks}</div>
<div class="cards">
<div class="c main"><small>Balance collected (${label})</small><b>${kes(stats.total)}</b><small>${esc(stats.paid_count)} paid</small></div>
<div class="c"><small>Pending</small><b>${esc(stats.pending_count)}</b></div>
<div class="c"><small>Failed / cancelled</small><b>${esc(stats.failed_count)}</b></div>
<div class="c"><small>Collected today</small><b>${kes(todayStats.total)}</b><small>${esc(todayStats.n)} payments</small></div>
<div class="c"><small>People who dialed (all time)</small><b>${esc(contacts)}</b></div>
</div>
<p><a href="?${qs}&format=csv">Download this range as CSV</a> &middot; <a href="?${qs}">Refresh</a> &middot; All times are East Africa Time &middot; showing up to 200 latest</p>
<div class="wrap"><table><thead><tr><th>When</th><th>Phone</th><th>Name</th><th class="n">KES</th><th>Status</th><th>Receipt</th><th>Reason</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="7">No payments in this range</td></tr>'}</tbody></table></div>
</body></html>`);
  } catch (e) {
    console.error('Admin error:', e.message);
    res.status(500).send('Database error: ' + esc(e.message));
  }
};
