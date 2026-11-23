CREATE TABLE IF NOT EXISTS contacts (
  phone       TEXT PRIMARY KEY,          -- 2547XXXXXXXX
  name        TEXT NOT NULL,
  source      TEXT DEFAULT 'ussd',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
