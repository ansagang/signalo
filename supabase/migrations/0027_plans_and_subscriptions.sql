-- ════════════════════════════════════════════════════════════════════════
-- Plans, subscriptions and expiring allowances.
--
-- Two kinds of credit, deliberately different:
--   subscription — the monthly allowance. Unused credits do not roll over.
--   topup/grant  — bought or given. These never expire.
--
-- Expiry is written as a transaction rather than filtered out on read. If a
-- grant simply vanished from the sum, a seller who had already spent it would
-- swing negative. Instead the renewal writes off only what was left unused,
-- which keeps the balance a plain sum and leaves an auditable trail.
--
-- No pricing lives here. Plans carry a price so the app can show it; what a
-- reply costs is in src/lib/ai/pricing.js with its tests.
-- ════════════════════════════════════════════════════════════════════════

alter table public.credit_transactions drop constraint if exists credit_transactions_reason_check;
alter table public.credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in ('usage', 'topup', 'grant', 'adjustment', 'refund', 'subscription', 'expiry'));

create table if not exists public.plans (
  key           text primary key,
  name          text not null,
  price_cents   integer not null check (price_cents >= 0),
  currency      text not null default 'usd',
  -- The monthly allowance, in credits. 1 credit = 1 US cent of billed usage.
  credits       integer not null check (credits >= 0),
  model_key     text not null default 'claude-sonnet',
  blurb         text,
  sort          integer not null default 0,
  active        boolean not null default true
);

create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references public.profiles(id) on delete cascade,
  plan_key             text not null references public.plans(key),
  status               text not null default 'active'
                         check (status in ('active', 'past_due', 'cancelled')),
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null,
  cancel_at_period_end boolean not null default false,
  -- Whatever the payment provider calls this subscription, so a webhook can
  -- find it again without us inventing an id mapping.
  provider             text,
  provider_ref         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists subscriptions_due on public.subscriptions (current_period_end)
  where status <> 'cancelled';

alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;

-- Plans are a price list: everyone signed in may read them.
drop policy if exists "readable" on public.plans;
create policy "readable" on public.plans for select to authenticated using (true);

drop policy if exists "own rows" on public.subscriptions;
create policy "own rows" on public.subscriptions
  for select using ((select auth.uid()) = user_id);

-- Priced from measured cost: an average reply is $0.0203 on Sonnet and
-- $0.0067 on Haiku, and a credit is one US cent of billed usage.
insert into public.plans (key, name, price_cents, credits, model_key, blurb, sort) values
  ('start',    'Start',    2000,  10000, 'claude-haiku',  'For a small shop finding its feet.', 1),
  ('business', 'Business', 6000,  30000, 'claude-sonnet', 'For a salon or restaurant taking bookings all day.', 2),
  ('pro',      'Pro',     16000,  90000, 'claude-sonnet', 'For high volume across several channels.', 3)
on conflict (key) do update
  set name = excluded.name, price_cents = excluded.price_cents,
      credits = excluded.credits, model_key = excluded.model_key,
      blurb = excluded.blurb, sort = excluded.sort;
