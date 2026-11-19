const { createClient } = require('@supabase/supabase-js');

let client;
function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// Always store phones as 2547XXXXXXXX
function normalizePhone(p) {
  let s = String(p || '').replace(/[^\d]/g, '');
  if (s.startsWith('0')) s = '254' + s.slice(1);
  else if ((s.startsWith('7') || s.startsWith('1')) && s.length === 9) s = '254' + s;
  return s;
}

module.exports = { db, normalizePhone };
