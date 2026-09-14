-- With a session cookie present the SSR client authenticates as the user, so
-- RLS applies to dashboard writes. conversations had SELECT and UPDATE
-- policies but no INSERT one, so the persona playground could never open a
-- conversation.
drop policy if exists "Users create own conversations" on public.conversations;
create policy "Users create own conversations" on public.conversations
  for insert with check ((select auth.uid()) = user_id);
