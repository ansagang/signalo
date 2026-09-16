-- ════════════════════════════════════════════════════════════════════════
-- A handoff ends.
--
-- Escalating set handoff = true and nothing ever set it back, so on Telegram
-- and WhatsApp — where one customer is one conversation for life — a single
-- "let me get a colleague" silenced the assistant for that customer forever.
-- A regular who asked about a refund in March got no answer in April.
--
-- Recording when it started lets the assistant come back once the humans have
-- clearly finished, while staying quiet as long as one is still replying.
-- ════════════════════════════════════════════════════════════════════════

alter table public.conversations
  add column if not exists handoff_at timestamptz;

comment on column public.conversations.handoff_at is
  'When a human took this conversation over. The assistant resumes once this '
  'and any agent replies have gone quiet — see src/lib/ai/handoff.js.';

-- Conversations already escalated get a start time, so they are not stuck
-- waiting on a timestamp that will never arrive.
update public.conversations
   set handoff_at = coalesce(last_message_at, updated_at, created_at)
 where handoff and handoff_at is null;
