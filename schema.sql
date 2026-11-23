-- OPTIONAL: the app creates this table automatically on first save.
-- Run it yourself only if your DB user is not allowed to CREATE TABLE.
CREATE TABLE IF NOT EXISTS contacts (
  phone       TEXT PRIMARY KEY,          -- 2547XXXXXXXX
  name        TEXT NOT NULL,
  source      TEXT DEFAULT 'ussd',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Your list:
-- SELECT phone, name FROM contacts;
