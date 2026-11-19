const { checkPassword, makeCookie, clearCookie } = require('./_lib/auth');

let fails = 0, windowStart = Date.now(); // basic brute-force brake (per warm instance)

module.exports = (req, res) => {
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', clearCookie()); return res.json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).end();
  if (Date.now() - windowStart > 15 * 60 * 1000) { fails = 0; windowStart = Date.now(); }
  if (fails >= 10) return res.status(429).json({ error: 'Too many attempts. Try again later.' });

  const pw = req.body && req.body.password;
  if (!checkPassword(pw)) { fails++; return res.status(401).json({ error: 'Wrong password' }); }
  res.setHeader('Set-Cookie', makeCookie());
  res.json({ ok: true });
};
