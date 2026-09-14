-- ════════════════════════════════════════════════════════════════════════
-- Catalogue + bookings.
--
-- Until now "products" and "services" were only knowledge_entries rows —
-- text the bot could quote, with nothing behind them. Nothing tracked stock,
-- nothing could be booked, and an order pointed at a paragraph rather than a
-- thing. This makes both first-class and accountable.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists btree_gist;

-- ── staff (masters / practitioners) ────────────────────────────────────
create table if not exists public.staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  icon        text,
  role_title  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists staff_user_idx on public.staff (user_id);

-- ── services (bookable work) ───────────────────────────────────────────
create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  description   text,
  category      text,
  duration_min  integer not null default 60 check (duration_min between 5 and 1440),
  buffer_min    integer not null default 0  check (buffer_min between 0 and 240),
  price         numeric not null default 0,
  currency      text not null default 'kzt',
  -- how many of this service can run at the same time (chairs, stations…)
  max_parallel  integer not null default 1 check (max_parallel between 1 and 50),
  active        boolean not null default true,
  embedding     extensions.vector(1536),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists services_user_idx on public.services (user_id);

-- which staff can perform which service; no rows = anyone can
create table if not exists public.service_staff (
  service_id uuid not null references public.services(id) on delete cascade,
  staff_id   uuid not null references public.staff(id)    on delete cascade,
  primary key (service_id, staff_id)
);

-- ── opening hours, per weekday (0 = Sunday) ────────────────────────────
create table if not exists public.business_hours (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles(id) on delete cascade,
  weekday  smallint not null check (weekday between 0 and 6),
  opens    time not null default '09:00',
  closes   time not null default '18:00',
  closed   boolean not null default false,
  unique (user_id, weekday)
);

-- ── appointments ───────────────────────────────────────────────────────
create table if not exists public.appointments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  service_id       uuid references public.services(id) on delete set null,
  staff_id         uuid references public.staff(id)    on delete set null,
  conversation_id  uuid references public.conversations(id) on delete set null,
  customer_name    text,
  customer_contact text,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null default 'booked'
                   check (status in ('booked','confirmed','completed','cancelled','no_show')),
  price            numeric not null default 0,
  currency         text not null default 'kzt',
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_user_start_idx on public.appointments (user_id, starts_at);
create index if not exists appointments_service_idx    on public.appointments (service_id, starts_at);
create index if not exists appointments_conversation_idx on public.appointments (conversation_id);

-- One master cannot be in two places. Enforced by the database, not by
-- whichever code path happened to write the row.
alter table public.appointments drop constraint if exists appointments_staff_no_overlap;
alter table public.appointments
  add constraint appointments_staff_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (staff_id is not null and status in ('booked','confirmed'));

-- ── products gain the fields an accountable catalogue needs ────────────
alter table public.products
  add column if not exists description   text,
  add column if not exists sku           text,
  add column if not exists currency      text not null default 'kzt',
  add column if not exists category      text,
  add column if not exists track_stock   boolean not null default true,
  add column if not exists active        boolean not null default true,
  add column if not exists low_stock_at  integer not null default 3;

create index if not exists products_user_idx on public.products (user_id);

-- ── stock ledger: every movement, with a reason ────────────────────────
create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  delta       integer not null,
  reason      text not null check (reason in ('order','restock','correction','return')),
  order_id    uuid references public.orders(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.staff           enable row level security;
alter table public.services        enable row level security;
alter table public.service_staff   enable row level security;
alter table public.business_hours  enable row level security;
alter table public.appointments    enable row level security;
alter table public.stock_movements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['staff','services','business_hours','appointments','stock_movements']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

drop policy if exists "own service_staff" on public.service_staff;
create policy "own service_staff" on public.service_staff for all
  using (exists (select 1 from public.services s where s.id = service_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.services s where s.id = service_id and s.user_id = (select auth.uid())));

-- ── updated_at ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['staff','services','appointments']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
