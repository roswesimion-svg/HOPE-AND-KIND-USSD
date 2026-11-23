// Runs every .sql file in ./migrations (in name order) that has not been applied yet.
// Usage:  node migrate.js        (or: npm run migrate)
// Connection: DATABASE_URL (or POSTGRES_URL), otherwise the standard PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT vars.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();
const url = clean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DB_URL);
const ssl = clean(process.env.PG_SSL) === 'true' ? { rejectUnauthorized: false } : false;

(async () => {
  const db = new Client(url ? { connectionString: url, ssl } : { ssl });
  await db.connect();
  console.log('Connected to database');

  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) { console.log('Skip (already applied):', f); continue; }
    console.log('Applying:', f);
    await db.query('BEGIN');
    try {
      await db.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await db.query('COMMIT');
      applied++;
    } catch (e) {
      await db.query('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }

  console.log(applied ? `Done. Applied ${applied} migration(s).` : 'Nothing to do. Database is up to date.');
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
