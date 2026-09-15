-- ════════════════════════════════════════════════════════════════════════
-- WhatsApp and email as first-class channels.
--
-- conversations.channel already allowed both (0003); only the channels table
-- itself was still limited to web and telegram.
-- ════════════════════════════════════════════════════════════════════════

alter table public.channels drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check
  check (type in ('web', 'telegram', 'whatsapp', 'email'));

-- A WhatsApp number or an inbox can only feed one channel, the same way a
-- Telegram bot can. Partial so the many web channels stay unconstrained.
create unique index if not exists channels_wa_phone_uniq
  on public.channels ((secrets->>'phone_number_id'))
  where type = 'whatsapp' and secrets->>'phone_number_id' is not null;

create unique index if not exists channels_email_address_uniq
  on public.channels ((lower(config->>'address')))
  where type = 'email' and config->>'address' is not null;
