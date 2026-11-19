const { db, normalizePhone } = require('./_lib/db');
const { isAuthed } = require('./_lib/auth');
const { sendSms } = require('./_lib/sms');

module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Not logged in' });
  if (req.method !== 'POST') return res.status(405).end();
  const { target, phone, message } = req.body || {};
  const msg = String(message || '').trim();
  if (!msg) return res.status(400).json({ error: 'Message is empty' });
  if (msg.length > 612) return res.status(400).json({ error: 'Message too long (max 612 characters)' });

  try {
    let phones;
    if (target === 'all') {
      const { data, error } = await db().from('members').select('phone');
      if (error) throw error;
      phones = data.map((m) => m.phone);
      if (!phones.length) return res.status(400).json({ error: 'No members yet' });
    } else {
      const p = normalizePhone(phone);
      if (!/^254[17]\d{8}$/.test(p)) return res.status(400).json({ error: 'Enter a valid Kenyan number e.g. 0712345678' });
      phones = [p];
    }
    res.json(await sendSms(phones, msg));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Could not send' });
  }
};
