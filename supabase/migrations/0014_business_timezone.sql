-- ════════════════════════════════════════════════════════════════════════
-- The business's own timezone.
--
-- Every slot, every timetable row and every "Friday at 19:30" the assistant
-- says was computed against a hardcoded Asia/Almaty. Correct for the first
-- customers, wrong for everyone else — and wrong silently, which is worse:
-- a booking lands hours out and nothing looks broken.
-- ════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists timezone text not null default 'Asia/Almaty';

comment on column public.profiles.timezone is
  'IANA zone the business runs on. Opening hours, slots and every displayed '
  'time are resolved against it.';

-- A bad zone makes every date function raise at query time, far from the
-- edit that caused it. A check constraint cannot query pg_timezone_names,
-- so validate on write instead.
create or replace function public.validate_timezone()
returns trigger
language plpgsql as $$
begin
  if new.timezone is null or new.timezone = '' then
    new.timezone := 'Asia/Almaty';
  end if;

  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'unknown_timezone:%', new.timezone;
  end if;

  return new;
end $$;

drop trigger if exists profiles_timezone_valid on public.profiles;
create trigger profiles_timezone_valid
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_timezone();
