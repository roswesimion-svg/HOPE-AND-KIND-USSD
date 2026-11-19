const crypto = require('crypto');

const COOKIE = 'hk_admin';
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}
function sign(v) {
  return crypto.createHmac('sha256', secret()).update(v).digest('hex');
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  // hash both so lengths match for timingSafeEqual
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  return safeEq(h(pw), h(real));
}

function makeCookie() {
  const exp = String(Date.now() + TTL_MS);
  const token = `${exp}.${sign(exp)}`;
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}`;
}
function clearCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function isAuthed(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEq(sig, sign(exp));
}

module.exports = { checkPassword, makeCookie, clearCookie, isAuthed };
