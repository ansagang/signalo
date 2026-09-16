-- ════════════════════════════════════════════════════════════════════════
-- Usage, credits and the bill.
--
-- Every assistant reply costs real money in model tokens, and until now
-- nothing counted it: a seller could not see what they had used and the
-- platform could not charge for it.
--
-- Two tables and a balance:
--   usage_events        what was spent, and on what
--   credit_transactions every movement of the balance, including top-ups
--   profiles.credits    the running balance, so a check is one read
--
-- The pricing itself is NOT here. Rates change, need testing, and belong in
-- src/lib/ai/pricing.js with the rest of the logic. This only records what
-- the application worked out.
-- ════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists credits numeric(14, 4) not null default 0;

comment on column public.profiles.credits is
  'Prepaid balance in credits. 1 credit is one US cent of billed usage.';

create table if not exists public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  channel         text,
  kind            text not null default 'chat'
                    check (kind in ('chat', 'embedding')),
  model           text not null,
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),
  credits         numeric(12, 4) not null default 0 check (credits >= 0),
  created_at      timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- Negative for usage, positive for a top-up or a grant.
  delta           numeric(12, 4) not null,
  balance_after   numeric(14, 4) not null,
  reason          text not null
                    check (reason in ('usage', 'topup', 'grant', 'adjustment', 'refund')),
  note            text,
  usage_event_id  uuid references public.usage_events(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists usage_events_user_time on public.usage_events (user_id, created_at desc);
create index if not exists credit_tx_user_time on public.credit_transactions (user_id, created_at desc);

alter table public.usage_events        enable row level security;
alter table public.credit_transactions enable row level security;

-- A seller reads their own history and never writes it; only the recorder
-- below may move a balance.
drop policy if exists "own rows" on public.usage_events;
create policy "own rows" on public.usage_events
  for select using ((select auth.uid()) = user_id);

drop policy if exists "own rows" on public.credit_transactions;
create policy "own rows" on public.credit_transactions
  for select using ((select auth.uid()) = user_id);

/**
 * Record what was spent and take it off the balance, in one transaction.
 *
 * Read-then-write again: two replies finishing at once would otherwise both
 * read the same balance and one of the charges would vanish.
 */
create or replace function public.record_usage(
  p_user_id         uuid,
  p_model           text,
  p_input_tokens    integer,
  p_output_tokens   integer,
  p_credits         numeric,
  p_kind            text default 'chat',
  p_conversation_id uuid default null,
  p_channel         text default null
)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_event   uuid;
  v_credits numeric(12, 4) := greatest(coalesce(p_credits, 0), 0);
  v_balance numeric(14, 4);
begin
  insert into public.usage_events
    (user_id, conversation_id, channel, kind, model, input_tokens, output_tokens, credits)
  values
    (p_user_id, p_conversation_id, p_channel, coalesce(p_kind, 'chat'), p_model,
     greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0), v_credits)
  returning id into v_event;

  -- Locks the row for the rest of the transaction.
  update public.profiles
     set credits = credits - v_credits
   where id = p_user_id
  returning credits into v_balance;

  if v_credits > 0 then
    insert into public.credit_transactions
      (user_id, delta, balance_after, reason, usage_event_id)
    values (p_user_id, -v_credits, v_balance, 'usage', v_event);
  end if;

  return v_balance;
end $$;

/** Add credits. Used by top-ups and by the welcome grant. */
create or replace function public.add_credits(
  p_user_id uuid,
  p_amount  numeric,
  p_reason  text default 'topup',
  p_note    text default null
)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric(14, 4);
begin
  if coalesce(p_amount, 0) <= 0 then raise exception 'amount_must_be_positive'; end if;

  update public.profiles
     set credits = credits + p_amount
   where id = p_user_id
  returning credits into v_balance;

  if not found then raise exception 'profile_not_found'; end if;

  insert into public.credit_transactions (user_id, delta, balance_after, reason, note)
  values (p_user_id, p_amount, v_balance, coalesce(p_reason, 'topup'), p_note);

  return v_balance;
end $$;

revoke all on function public.record_usage(uuid, text, integer, integer, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_usage(uuid, text, integer, integer, numeric, text, uuid, text) to service_role;
revoke all on function public.add_credits(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.add_credits(uuid, numeric, text, text) to service_role;

-- Existing accounts start with a working balance rather than locked out.
do $$
declare r record;
begin
  for r in select id from public.profiles where credits = 0 loop
    perform public.add_credits(r.id, 5000, 'grant', 'Welcome balance');
  end loop;
end $$;
