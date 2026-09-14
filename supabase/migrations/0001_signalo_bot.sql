-- ════════════════════════════════════════════════════════════════════════
-- Signalo — selling-bot schema
-- Adds: channels, orders, order_items(jsonb), conversation wiring,
--       and a corrected knowledge-base vector search.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Conversations: wire to persona + channel ────────────────────────
alter table public.conversations
  add column if not exists persona_id  uuid references public.personas(id) on delete set null,
  add column if not exists channel_id  uuid,
  add column if not exists handoff     boolean not null default false,
  add column if not exists last_intent text,
  add column if not exists locale      text;

create index if not exists conversations_user_last_msg_idx
  on public.conversations (user_id, last_message_at desc);

create index if not exists conversations_session_idx
  on public.conversations (external_session_id);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- ── 2. Channels: where customers reach the bot ─────────────────────────
create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  persona_id  uuid references public.personas(id) on delete set null,
  type        text not null check (type in ('web','telegram')),
  name        text not null,
  public_key  text not null unique,
  secrets     jsonb not null default '{}'::jsonb,
  config      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists channels_user_idx on public.channels (user_id);

alter table public.conversations
  drop constraint if exists conversations_channel_id_fkey;
alter table public.conversations
  add constraint conversations_channel_id_fkey
  foreign key (channel_id) references public.channels(id) on delete set null;

-- ── 3. Orders: what the bot actually sells ─────────────────────────────
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_name   text,
  customer_contact text,
  items           jsonb not null default '[]'::jsonb,
  total           numeric not null default 0,
  currency        text not null default 'kzt',
  status          text not null default 'new'
                  check (status in ('new','confirmed','fulfilled','cancelled')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_conversation_idx on public.orders (conversation_id);

-- ── 4. RLS ─────────────────────────────────────────────────────────────
alter table public.channels enable row level security;
alter table public.orders   enable row level security;

drop policy if exists "Users manage own channels" on public.channels;
create policy "Users manage own channels" on public.channels
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own orders" on public.orders;
create policy "Users manage own orders" on public.orders
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- messages: the dashboard needs INSERT/UPDATE too (service role bypasses,
-- but keep the policy set coherent for anon/authenticated paths)
drop policy if exists "Users write messages in own conversations" on public.messages;
create policy "Users write messages in own conversations" on public.messages
  for insert with check (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = (select auth.uid())
  ));

drop policy if exists "Users update own conversations by user_id" on public.conversations;
create policy "Users update own conversations by user_id" on public.conversations
  for update using ((select auth.uid()) = user_id);

-- ── 5. Fixed knowledge-base vector search ──────────────────────────────
-- The previous definition was unusable: its RETURNS TABLE was copied from
-- match_products (id/name/price/stock) while the body selected nine columns,
-- referenced a non-existent `status` column, and used an undeclared
-- `filter_persona_id`. Any call raised at runtime.
drop function if exists public.match_knowledge_base(extensions.vector, integer, uuid);
drop function if exists public.match_knowledge_base(extensions.vector, integer, uuid, text);

create function public.match_knowledge_base(
  query_embedding   extensions.vector,
  match_count       integer default 8,
  filter_user_id    uuid    default null,
  filter_persona_id text    default null
)
returns table (
  id         uuid,
  type       text,
  title      text,
  content    text,
  keywords   text,
  persona_id text,
  priority   bigint,
  metadata   jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    ke.id, ke.type, ke.title, ke.content, ke.keywords,
    ke.persona_id, ke.priority, ke.metadata,
    1 - (ke.embedding <=> query_embedding) as similarity
  from public.knowledge_entries ke
  where ke.embedding is not null
    and ke.active is true
    and (filter_user_id is null or ke.user_id = filter_user_id)
    and (filter_persona_id is null
         or ke.persona_id is null
         or ke.persona_id = filter_persona_id)
  -- relevance first; priority (1-10) only nudges ties
  order by (1 - (ke.embedding <=> query_embedding)) + (coalesce(ke.priority, 1)::float / 100) desc
  limit match_count;
$$;

-- ── 6. updated_at triggers ─────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists channels_touch on public.channels;
create trigger channels_touch before update on public.channels
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
