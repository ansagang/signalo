-- ════════════════════════════════════════════════════════════════════════
-- Instagram DMs as a first-class channel.
--
-- Same shape as WhatsApp: Meta credentials live in channels.secrets, the
-- inbound route is per-channel, and conversations carry 'instagram' so the
-- inbox can tell them apart.
-- ════════════════════════════════════════════════════════════════════════

alter table public.channels drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check
  check (type in ('web', 'telegram', 'whatsapp', 'email', 'instagram'));

alter table public.conversations
  drop constraint if exists conversations_channel_check;
alter table public.conversations
  add constraint conversations_channel_check
  check (channel = any (array['whatsapp','telegram','email','webchat','playground','instagram']));

-- One Instagram account feeds one channel. Meta addresses inbound webhooks by
-- the account id, so two channels sharing it would make delivery ambiguous.
create unique index if not exists channels_ig_account_uniq
  on public.channels ((secrets->>'ig_id'))
  where type = 'instagram' and secrets->>'ig_id' is not null;
