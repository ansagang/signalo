-- ════════════════════════════════════════════════════════════════════════
-- Real scheduling.
--
-- Availability used to be "every 15 minutes inside the shop's opening hours",
-- which is not how a salon works. Admins decide when a service can start, and
-- each service is done by particular masters who have their own shifts.
-- ════════════════════════════════════════════════════════════════════════

-- ── how a service's start times are decided ────────────────────────────
alter table public.services
  add column if not exists slot_mode     text not null default 'grid'
    check (slot_mode in ('grid','fixed')),
  -- grid mode: a start every N minutes from the start of the shift
  add column if not exists slot_step_min integer not null default 30
    check (slot_step_min between 5 and 480),
  -- fixed mode: exactly these local start times, e.g. {10:00,12:30,15:00}
  add column if not exists slot_times    time[] not null default '{}',
  add column if not exists image_url     text,
  add column if not exists lead_time_min integer not null default 0
    check (lead_time_min between 0 and 20160);

alter table public.products
  add column if not exists image_url text;

-- ── per-master shifts ──────────────────────────────────────────────────
-- A master with no rows at all falls back to the shop's opening hours, so
-- adding staff does not silently empty the calendar.
create table if not exists public.staff_hours (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  staff_id  uuid not null references public.staff(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  starts_at time not null default '10:00',
  ends_at   time not null default '19:00',
  off       boolean not null default false,
  unique (staff_id, weekday)
);
create index if not exists staff_hours_staff_idx on public.staff_hours (staff_id);

alter table public.staff_hours enable row level security;
drop policy if exists "own rows" on public.staff_hours;
create policy "own rows" on public.staff_hours for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── availability, rebuilt ──────────────────────────────────────────────
-- Returns one row per (start time, master who is free for it).
drop function if exists public.available_slots(uuid, uuid, date, uuid, integer, text);
drop function if exists public.available_slots(uuid, uuid, date, uuid, text);

create function public.available_slots(
  p_user_id    uuid,
  p_service_id uuid,
  p_day        date,
  p_staff_id   uuid default null,
  p_timezone   text default 'Asia/Almaty'
)
returns table (
  slot_start timestamptz,
  slot_end   timestamptz,
  staff_id   uuid,
  staff_name text
)
language plpgsql stable as $$
declare
  v_service   public.services%rowtype;
  v_hours     public.business_hours%rowtype;
  v_shop_open timestamptz;
  v_shop_shut timestamptz;
  v_weekday   smallint := extract(dow from p_day)::smallint;
  v_total     integer;
  v_earliest  timestamptz;
  r_staff     record;
  v_from      timestamptz;
  v_to        timestamptz;
  v_cursor    timestamptz;
  v_end       timestamptz;
  v_time      time;
  v_taken     integer;
  v_assigned  integer;
  v_off       boolean;
begin
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then return; end if;

  select * into v_hours from public.business_hours
   where user_id = p_user_id and weekday = v_weekday;

  if not found then
    v_shop_open := (p_day + time '09:00') at time zone p_timezone;
    v_shop_shut := (p_day + time '18:00') at time zone p_timezone;
  elsif v_hours.closed then
    return;
  else
    v_shop_open := (p_day + v_hours.opens)  at time zone p_timezone;
    v_shop_shut := (p_day + v_hours.closes) at time zone p_timezone;
  end if;

  v_total    := v_service.duration_min + v_service.buffer_min;
  -- Nothing can be booked sooner than the service's notice period.
  v_earliest := now() + make_interval(mins => v_service.lead_time_min);

  select count(*) into v_assigned
    from public.service_staff where service_id = p_service_id;

  -- Which masters are candidates for this service.
  for r_staff in
    select s.id, s.name
      from public.staff s
     where s.user_id = p_user_id
       and s.active
       and (p_staff_id is null or s.id = p_staff_id)
       and (
         v_assigned = 0                       -- nobody assigned: anyone may do it
         or exists (select 1 from public.service_staff ss
                     where ss.service_id = p_service_id and ss.staff_id = s.id)
       )
     order by s.created_at
  loop
    -- The master's own shift, clipped to the shop's hours.
    select
      coalesce(greatest(v_shop_open, (p_day + sh.starts_at) at time zone p_timezone), v_shop_open),
      coalesce(least   (v_shop_shut, (p_day + sh.ends_at)   at time zone p_timezone), v_shop_shut),
      sh.off
    into v_from, v_to, v_off
    from public.staff_hours sh
    where sh.staff_id = r_staff.id and sh.weekday = v_weekday;

    if found then
      if v_off then continue; end if;              -- day off
    else
      v_from := v_shop_open;                        -- no shift set: shop hours
      v_to   := v_shop_shut;
    end if;

    -- Candidate start times, however the admin chose to define them.
    if v_service.slot_mode = 'fixed' and array_length(v_service.slot_times, 1) > 0 then
      foreach v_time in array v_service.slot_times loop
        v_cursor := (p_day + v_time) at time zone p_timezone;
        v_end    := v_cursor + make_interval(mins => v_service.duration_min);

        if v_cursor < v_from or v_cursor + make_interval(mins => v_total) > v_to then continue; end if;
        if v_cursor < v_earliest then continue; end if;

        select count(*) into v_taken from public.appointments a
         where a.user_id = p_user_id and a.staff_id = r_staff.id
           and a.status in ('booked','confirmed')
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_end);

        if v_taken = 0 then
          slot_start := v_cursor; slot_end := v_end;
          staff_id := r_staff.id; staff_name := r_staff.name;
          return next;
        end if;
      end loop;
    else
      v_cursor := v_from;
      while v_cursor + make_interval(mins => v_total) <= v_to loop
        v_end := v_cursor + make_interval(mins => v_service.duration_min);

        if v_cursor >= v_earliest then
          select count(*) into v_taken from public.appointments a
           where a.user_id = p_user_id and a.staff_id = r_staff.id
             and a.status in ('booked','confirmed')
             and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_end);

          if v_taken = 0 then
            slot_start := v_cursor; slot_end := v_end;
            staff_id := r_staff.id; staff_name := r_staff.name;
            return next;
          end if;
        end if;

        v_cursor := v_cursor + make_interval(mins => v_service.slot_step_min);
      end loop;
    end if;
  end loop;
end $$;

-- ── booking now insists on a master and a legitimate start time ────────
drop function if exists public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, text, text);
drop function if exists public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, text, text, text);
create function public.book_appointment(
  p_user_id          uuid,
  p_service_id       uuid,
  p_starts_at        timestamptz,
  p_staff_id         uuid default null,
  p_conversation_id  uuid default null,
  p_customer_name    text default null,
  p_customer_contact text default null,
  p_note             text default null,
  p_timezone         text default 'Asia/Almaty'
)
returns public.appointments
language plpgsql as $$
declare
  v_service public.services%rowtype;
  v_end     timestamptz;
  v_staff   uuid := p_staff_id;
  v_ok      integer;
  v_row     public.appointments%rowtype;
begin
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then raise exception 'service_not_found'; end if;

  v_end := p_starts_at + make_interval(mins => v_service.duration_min);

  perform pg_advisory_xact_lock(hashtextextended(p_service_id::text, 0));

  -- The requested time must be one the schedule actually offers. This is the
  -- backstop for a caller that invents a start time.
  select count(*) into v_ok
    from public.available_slots(
      p_user_id, p_service_id,
      (p_starts_at at time zone p_timezone)::date,
      p_staff_id, p_timezone) s
   where s.slot_start = p_starts_at;

  if v_ok = 0 then raise exception 'slot_taken'; end if;

  if v_staff is null then
    select s.staff_id into v_staff
      from public.available_slots(
        p_user_id, p_service_id,
        (p_starts_at at time zone p_timezone)::date,
        null, p_timezone) s
     where s.slot_start = p_starts_at
     limit 1;
  end if;

  insert into public.appointments
    (user_id, service_id, staff_id, conversation_id, customer_name,
     customer_contact, starts_at, ends_at, price, currency, note)
  values
    (p_user_id, p_service_id, v_staff, p_conversation_id, p_customer_name,
     p_customer_contact, p_starts_at, v_end, v_service.price, v_service.currency, p_note)
  returning * into v_row;

  return v_row;
end $$;
