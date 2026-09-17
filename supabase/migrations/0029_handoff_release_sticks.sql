-- ════════════════════════════════════════════════════════════════════════
-- Remember that a person deliberately handed a conversation back.
--
-- Clearing `handoff` was enough for the assistant to start replying again,
-- but not enough for it to stop escalating: the transcript still ends with
-- "a colleague will help", so the model read the situation the same way it
-- had a moment earlier and called request_human on the customer's very next
-- message. An agent's decision was undone before they had finished reading it.
--
-- With a release timestamp the assistant can be required to actually try
-- before it is allowed to escalate again.
-- ════════════════════════════════════════════════════════════════════════

alter table public.conversations
  add column if not exists handoff_released_at timestamptz;

comment on column public.conversations.handoff_released_at is
  'When a human last handed this conversation back to the assistant. The assistant must reply at least once after this before it may escalate again.';
