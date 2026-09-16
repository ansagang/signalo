-- ════════════════════════════════════════════════════════════════════════
-- The balance is the ledger.
--
-- 0025 kept a running total on profiles.credits and needed two database
-- functions to move it, because "read the balance, subtract, write it back"
-- races. Deriving the balance from the transactions instead removes the race
-- rather than locking around it: recording usage becomes two inserts, and
-- inserts do not race with anything.
--
-- It is also the more honest model. A stored total can drift from the rows it
-- claims to summarise; a sum cannot.
--
-- Booking keeps its lock because there the answer must be decided before the
-- write. Here nothing is decided — we are only writing down what happened.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.record_usage(uuid, text, integer, integer, numeric, text, uuid, text);
drop function if exists public.add_credits(uuid, numeric, text, text);

alter table public.profiles drop column if exists credits;

-- Was only meaningful when a stored total existed; the sum is the balance now.
alter table public.credit_transactions drop column if exists balance_after;

comment on table public.credit_transactions is
  'Append-only. The balance is sum(delta) — see src/lib/services/billing.js.';

-- The balance is read on most assistant turns, so make the sum cheap.
create index if not exists credit_tx_user on public.credit_transactions (user_id);
