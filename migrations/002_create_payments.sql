CREATE TABLE IF NOT EXISTS payments (
  id                   BIGSERIAL PRIMARY KEY,
  checkout_request_id  TEXT UNIQUE,            -- ties the STK push to M-Pesa's callback
  merchant_request_id  TEXT,
  phone                TEXT NOT NULL,          -- number the STK prompt was sent to
  name                 TEXT,
  amount               NUMERIC(12,2) NOT NULL, -- KES; replaced by the amount M-Pesa confirms
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending | success | failed
  mpesa_receipt        TEXT,                   -- e.g. SGL7XXXXXX
  paid_phone           TEXT,                   -- number that actually paid (from M-Pesa)
  result_code          INTEGER,
  result_desc          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments (paid_at);
CREATE INDEX IF NOT EXISTS payments_phone_idx ON payments (phone);
