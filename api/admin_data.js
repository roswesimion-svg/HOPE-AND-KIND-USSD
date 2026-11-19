const { db } = require('./_lib/db');
const { isAuthed } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Not logged in' });
  try {
    const s = db();
    const [pay, mem] = await Promise.all([
      s.from('payments').select('*').order('created_at', { ascending: false }).limit(1000),
      s.from('members').select('*').order('created_at', { ascending: false }).limit(5000),
    ]);
    if (pay.error) throw pay.error;
    if (mem.error) throw mem.error;
    const total = pay.data.filter((p) => p.status === 'success')
      .reduce((a, p) => a + Number(p.amount || 0), 0);
    res.json({ payments: pay.data, members: mem.data, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load data' });
  }
};
