const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>HOPE and KIND – Admin</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1a1d21;--muted:#6b7280;--line:#e5e7eb;--accent:#0f766e;--bad:#b91c1c}
@media(prefers-color-scheme:dark){:root{--bg:#111418;--card:#1b1f25;--text:#e8eaed;--muted:#9aa3ad;--line:#2b313a;--accent:#2dd4bf;--bad:#f87171}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}
.wrap{max-width:960px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:0 0 10px}
input,textarea,select,button{font:inherit;padding:9px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text);width:100%}
button{background:var(--accent);color:#fff;border:0;cursor:pointer;width:auto;padding:9px 16px}
button.ghost{background:transparent;color:var(--muted);border:1px solid var(--line)}
button:disabled{opacity:.5}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.total{font-size:28px;font-weight:700;color:var(--accent)}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);white-space:nowrap}th{color:var(--muted);font-weight:600}
.tag{padding:2px 8px;border-radius:99px;font-size:12px;border:1px solid var(--line)}
.success{color:var(--accent)}.failed{color:var(--bad)}.pending{color:var(--muted)}
#msg{min-height:20px;margin-top:8px}.err{color:var(--bad)}.ok{color:var(--accent)}
.hide{display:none}
</style></head><body><div class="wrap">

<div id="login" class="card hide" style="max-width:380px;margin:60px auto">
  <h1>Admin login</h1><p style="color:var(--muted)">HOPE and KIND</p>
  <input id="pw" type="password" placeholder="Password" autocomplete="current-password">
  <div class="row" style="margin-top:10px"><button id="loginBtn">Log in</button><span id="loginErr" class="err"></span></div>
</div>

<div id="app" class="hide">
  <div class="row" style="justify-content:space-between;margin-bottom:12px">
    <h1>HOPE and KIND – Admin</h1>
    <div class="row"><button class="ghost" id="refresh">Refresh</button><button class="ghost" id="logout">Log out</button></div>
  </div>

  <div class="card">
    <div style="color:var(--muted)">Total received (successful payments)</div>
    <div class="total" id="total">KES 0</div>
    <div style="color:var(--muted)" id="counts"></div>
  </div>

  <div class="card">
    <h2>Send SMS</h2>
    <div class="row">
      <select id="target" style="max-width:260px">
        <option value="all">All members</option>
        <option value="one">One number</option>
      </select>
      <input id="phone" class="hide" placeholder="0712345678" style="max-width:220px">
    </div>
    <textarea id="text" rows="4" maxlength="612" placeholder="Type your message…" style="margin-top:10px"></textarea>
    <div class="row" style="margin-top:10px">
      <button id="send">Send</button><span id="chars" style="color:var(--muted)"></span>
    </div>
    <div id="msg"></div>
  </div>

  <div class="card"><h2>Payments</h2><div class="scroll"><table id="pay"></table></div></div>
  <div class="card"><h2>Members</h2><div class="scroll"><table id="mem"></table></div></div>
</div>

</div>
<script>
const $ = (id) => document.getElementById(id);
const show = (id, v) => $(id).classList.toggle('hide', !v);

function table(el, heads, rows) {
  el.replaceChildren();
  const thead = el.createTHead().insertRow();
  heads.forEach((h) => { const th = document.createElement('th'); th.textContent = h; thead.appendChild(th); });
  const tb = el.createTBody();
  if (!rows.length) { const c = tb.insertRow().insertCell(); c.colSpan = heads.length; c.textContent = 'Nothing yet'; c.style.color = 'var(--muted)'; }
  rows.forEach((r) => {
    const tr = tb.insertRow();
    r.forEach((v) => {
      const td = tr.insertCell();
      if (v && typeof v === 'object') { td.textContent = v.t; td.className = v.c; } else td.textContent = v ?? '';
    });
  });
}
const fmt = (d) => d ? new Date(d).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '';

async function load() {
  const r = await fetch('/api/admin_data');
  if (r.status === 401) { show('app', false); show('login', true); return; }
  const d = await r.json();
  if (!r.ok) { alert(d.error || 'Error'); return; }
  show('login', false); show('app', true);
  $('total').textContent = 'KES ' + Number(d.total).toLocaleString();
  const ok = d.payments.filter((p) => p.status === 'success').length;
  $('counts').textContent = ok + ' successful payments · ' + d.members.length + ' members';
  table($('pay'), ['Date', 'Name', 'Phone', 'Amount', 'M-Pesa receipt', 'Status'],
    d.payments.map((p) => [fmt(p.paid_at || p.created_at), p.name, p.phone, p.amount, p.mpesa_receipt, { t: p.status, c: 'tag ' + p.status }]));
  table($('mem'), ['Joined', 'Name', 'Phone'], d.members.map((m) => [fmt(m.created_at), m.name, m.phone]));
}

$('loginBtn').onclick = async () => {
  $('loginErr').textContent = '';
  const r = await fetch('/api/admin_login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('pw').value }) });
  if (r.ok) { $('pw').value = ''; load(); } else $('loginErr').textContent = (await r.json()).error || 'Failed';
};
$('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });
$('logout').onclick = async () => { await fetch('/api/admin_login', { method: 'DELETE' }); load(); };
$('refresh').onclick = load;
$('target').onchange = () => show('phone', $('target').value === 'one');
$('text').oninput = () => { const n = $('text').value.length; $('chars').textContent = n + ' chars · ' + Math.max(1, Math.ceil(n / 160)) + ' SMS each'; };

$('send').onclick = async () => {
  const all = $('target').value === 'all';
  if (all && !confirm('Send this message to ALL members?')) return;
  const btn = $('send'), m = $('msg');
  btn.disabled = true; m.className = ''; m.textContent = 'Sending…';
  try {
    const r = await fetch('/api/admin_send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: $('target').value, phone: $('phone').value, message: $('text').value }) });
    const d = await r.json();
    if (!r.ok) { m.className = 'err'; m.textContent = d.error || 'Failed'; }
    else {
      m.className = d.failed ? 'err' : 'ok';
      m.textContent = 'Sent: ' + d.sent + (d.failed ? ' · Failed: ' + d.failed + ' (' + d.errors.join('; ') + ')' : '');
      if (!d.failed) $('text').value = '';
    }
  } catch (e) { m.className = 'err'; m.textContent = 'Network error'; }
  btn.disabled = false;
};
load();
</script></body></html>`;

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(HTML);
};
