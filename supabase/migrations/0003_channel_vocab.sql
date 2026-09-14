-- conversations.channel already allows whatsapp/telegram/email/webchat.
-- The dashboard's persona playground is a fourth source that is not a real
-- customer channel, so it gets its own value rather than being mislabelled
-- as webchat and polluting the inbox.
alter table public.conversations
  drop constraint if exists conversations_channel_check;
alter table public.conversations
  add constraint conversations_channel_check
  check (channel = any (array['whatsapp','telegram','email','webchat','playground']));
