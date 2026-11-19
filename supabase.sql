-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists members (
  id          bigint generated always as identity primary key,
  phone       text not null unique,          -- format 2547XXXXXXXX
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists payments (
  id                  bigint generated always as identity primary key,
  checkout_request_id text unique,           -- links the STK push to its callback
  phone               text not null,
  name                text,
  amount              numeric,
  mpesa_receipt       text,
  status              text not null default 'pending',  -- pending | success | failed
  result_desc         text,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);

create index if not exists payments_created_idx on payments (created_at desc);

-- Lock the tables: only your server (service key) can read/write them.
alter table members  enable row level security;
alter table payments enable row level security;
