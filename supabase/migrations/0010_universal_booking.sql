-- ════════════════════════════════════════════════════════════════════════
-- Universal booking.
--
-- The model said "a person performs a service", which only fits salons. A
-- restaurant books a table for a party, a hotel books a room for a night, a
-- studio sells seats in one class. All three are the same shape once you name
-- it properly: a bookable thing occupies a RESOURCE for a span, and resources
-- have CAPACITY.
--
--   appointment — resource taken exclusively, one customer      (haircut)
--   seating     — resource taken exclusively, must seat a party (table, room)
--   class       — resource shared until its seats run out       (yoga, tour)
-- ════════════════════════════════════════════════════════════════════════

alter table public.staff          rename to resources;
alter table public.staff_hours    rename to resource_hours;
alter table public.service_staff  rename to service_resources;

alter table public.resource_hours     rename column staff_id to resource_id;
alter table public.service_resources  rename column staff_id to resource_id;
alter table public.appointments       rename column staff_id to resource_id;

-- ── what a resource is, and how many it holds ──────────────────────────
alter table public.resources
  add column if not exists kind text not null default 'person'
    check (kind in ('person','table','room','equipment')),
  add column if not exists capacity integer not null default 1
    check (capacity between 1 and 500);

comment on column public.resources.capacity is
  'People this resource holds at once: 1 for a stylist, 4 for a table, 20 for a studio.';

-- ── how a service consumes a resource ──────────────────────────────────
alter table public.services
  add column if not exists booking_mode text not null default 'appointment'
    check (booking_mode in ('appointment','seating','class')),
  add column if not exists min_party integer not null default 1 check (min_party >= 1),
  add column if not exists max_party integer not null default 1 check (max_party >= 1);

alter table public.appointments
  add column if not exists party_size integer not null default 1
    check (party_size between 1 and 500);

-- ── availability, capacity-aware ───────────────────────────────────────
drop function if exists public.available_slots(uuid, uuid, date, uuid, text);
drop function if exists public.available_slots(uuid, uuid, date, uuid, text, integer);
create function public.available_slots(
  p_user_id     uuid,
  p_service_id  uuid,
  p_day         date,
  p_resource_id uuid    default null,
  p_timezone    text    default 'Asia/Almaty',
  p_party       integer default 1
)
returns table (
  slot_start    timestamptz,
  slot_end      timestamptz,
  resource_id   uuid,
  resource_name text,
  seats_left    integer
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
  v_assigned  integer;
  v_party     integer := greatest(coalesce(p_party, 1), 1);
  r_res       record;
  v_from      timestamptz;
  v_to        timestamptz;
  v_cursor    timestamptz;
  v_end       timestamptz;
  v_time      time;
  v_used      integer;
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
  v_earliest := now() + make_interval(mins => v_service.lead_time_min);

  select count(*) into v_assigned
    from public.service_resources where service_id = p_service_id;

  for r_res in
    select r.id, r.name, r.capacity
      from public.resources r
     where r.user_id = p_user_id
       and r.active
       and (p_resource_id is null or r.id = p_resource_id)
       -- A resource must be big enough for the party in every mode.
       and r.capacity >= v_party
       and (
         v_assigned = 0
         or exists (select 1 from public.service_resources sr
                     where sr.service_id = p_service_id and sr.resource_id = r.id)
       )
     -- Smallest sufficient resource first: do not seat two people at the big table.
     order by r.capacity, r.created_at
  loop
    select
      coalesce(greatest(v_shop_open, (p_day + rh.starts_at) at time zone p_timezone), v_shop_open),
      coalesce(least   (v_shop_shut, (p_day + rh.ends_at)   at time zone p_timezone), v_shop_shut),
      rh.off
    into v_from, v_to, v_off
    from public.resource_hours rh
    where rh.resource_id = r_res.id and rh.weekday = v_weekday;

    if found then
      if v_off then continue; end if;
    else
      v_from := v_shop_open;
      v_to   := v_shop_shut;
    end if;

    -- Candidate start times, however the admin defined them. Two plain
    -- branches: a set-returning function cannot live inside a CASE.
    for v_cursor in
      select gs from generate_series(
               v_from,
               v_to - make_interval(mins => v_total),
               make_interval(mins => greatest(v_service.slot_step_min, 5))
             ) gs
       where v_service.slot_mode <> 'fixed'
          or coalesce(array_length(v_service.slot_times, 1), 0) = 0
      union all
      select (p_day + tm) at time zone p_timezone
        from unnest(
               case when v_service.slot_mode = 'fixed'
                    then v_service.slot_times
                    else '{}'::time[] end
             ) tm
      order by 1
    loop
      v_end := v_cursor + make_interval(mins => v_service.duration_min);

      if v_cursor < v_from or v_cursor + make_interval(mins => v_total) > v_to then continue; end if;
      if v_cursor < v_earliest then continue; end if;

      if v_service.booking_mode = 'class' then
        -- Shared: seats already taken on this resource in this window.
        select coalesce(sum(a.party_size), 0) into v_used
          from public.appointments a
         where a.user_id = p_user_id and a.resource_id = r_res.id
           and a.status in ('booked','confirmed')
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_end);

        if r_res.capacity - v_used >= v_party then
          slot_start := v_cursor; slot_end := v_end;
          resource_id := r_res.id; resource_name := r_res.name;
          seats_left := r_res.capacity - v_used;
          return next;
        end if;
      else
        -- Exclusive: the resource must be entirely free.
        select count(*) into v_used
          from public.appointments a
         where a.user_id = p_user_id and a.resource_id = r_res.id
           and a.status in ('booked','confirmed')
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_end);

        if v_used = 0 then
          slot_start := v_cursor; slot_end := v_end;
          resource_id := r_res.id; resource_name := r_res.name;
          seats_left := r_res.capacity;
          return next;
        end if;
      end if;
    end loop;
  end loop;
end $$;

-- ── booking ────────────────────────────────────────────────────────────
drop function if exists public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, text, text, text);
drop function if exists public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, text, text, text, integer);
create function public.book_appointment(
  p_user_id          uuid,
  p_service_id       uuid,
  p_starts_at        timestamptz,
  p_resource_id      uuid default null,
  p_conversation_id  uuid default null,
  p_customer_name    text default null,
  p_customer_contact text default null,
  p_note             text default null,
  p_timezone         text default 'Asia/Almaty',
  p_party            integer default 1
)
returns public.appointments
language plpgsql as $$
declare
  v_service  public.services%rowtype;
  v_end      timestamptz;
  v_resource uuid := p_resource_id;
  v_party    integer := greatest(coalesce(p_party, 1), 1);
  v_row      public.appointments%rowtype;
begin
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then raise exception 'service_not_found'; end if;

  if v_party < v_service.min_party or v_party > greatest(v_service.max_party, v_service.min_party) then
    raise exception 'party_out_of_range:%:%', v_service.min_party, v_service.max_party;
  end if;

  v_end := p_starts_at + make_interval(mins => v_service.duration_min);

  perform pg_advisory_xact_lock(hashtextextended(p_service_id::text, 0));

  -- The requested time must be one the schedule actually offers, for a
  -- resource that can still take this party.
  select s.resource_id into v_resource
    from public.available_slots(
      p_user_id, p_service_id,
      (p_starts_at at time zone p_timezone)::date,
      p_resource_id, p_timezone, v_party) s
   where s.slot_start = p_starts_at
   limit 1;

  if v_resource is null then raise exception 'slot_taken'; end if;

  insert into public.appointments
    (user_id, service_id, resource_id, conversation_id, customer_name,
     customer_contact, starts_at, ends_at, price, currency, note, party_size)
  values
    (p_user_id, p_service_id, v_resource, p_conversation_id, p_customer_name,
     p_customer_contact, p_starts_at, v_end, v_service.price, v_service.currency,
     p_note, v_party)
  returning * into v_row;

  return v_row;
end $$;

-- ── the overlap guard follows the renamed column ───────────────────────
alter table public.appointments drop constraint if exists appointments_staff_no_overlap;
alter table public.appointments drop constraint if exists appointments_resource_no_overlap;
-- Only exclusive modes may not overlap; classes share a resource by design,
-- so the check lives in book_appointment rather than a blanket constraint.

-- ── services search exposes the new shape ──────────────────────────────
drop function if exists public.match_services(extensions.vector, integer, uuid);
create function public.match_services(
  query_embedding extensions.vector,
  match_count     integer default 6,
  filter_user_id  uuid    default null
)
returns table (
  id uuid, name text, description text, category text,
  duration_min integer, buffer_min integer, price numeric, currency text,
  max_parallel integer, image_url text, masters text,
  booking_mode text, min_party integer, max_party integer,
  similarity double precision
)
language sql stable as $$
  select s.id, s.name, s.description, s.category,
         s.duration_min, s.buffer_min, s.price, s.currency, s.max_parallel,
         s.image_url,
         (select string_agg(r.name, ', ' order by r.name)
            from public.service_resources sr
            join public.resources r on r.id = sr.resource_id and r.active
           where sr.service_id = s.id) as masters,
         s.booking_mode, s.min_party, s.max_party,
         1 - (s.embedding <=> query_embedding)
  from public.services s
  where s.embedding is not null
    and s.active is true
    and (filter_user_id is null or s.user_id = filter_user_id)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
