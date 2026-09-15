-- ════════════════════════════════════════════════════════════════════════
-- People become optional.
--
-- 0010 rewrote availability as a loop over resources, which quietly made a
-- person mandatory: a restaurant with no staff entered got no slots at all,
-- and a party of six could never be booked because it was compared against a
-- person's capacity of one. Assigning "a host" to every table reservation was
-- the workaround, and it was a lie about how the business works.
--
-- The honest model has two independent questions:
--
--   how many at once?   →  services.capacity   (tables, mats, chairs, seats)
--   who performs it?    →  service_resources   (optional; salons use it)
--
-- With people assigned, each person is a lane and the customer can pick one.
-- With none, there is a single pool of `capacity` and no resource on the
-- booking. Party size is bounded by min_party/max_party and nothing else.
-- ════════════════════════════════════════════════════════════════════════

-- max_parallel already meant "how many at the same time" and stopped being
-- read in 0010. Give it the clearer name rather than adding a second column.
alter table public.services rename column max_parallel to capacity;

alter table public.services
  alter column capacity set default 1;

comment on column public.services.capacity is
  'How many of this can run at the same time: tables in the room, seats in the '
  'class, chairs in the shop. Ignored when specific people are assigned, since '
  'then each person is their own lane.';

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
  v_capacity  integer;
  v_party     integer := greatest(coalesce(p_party, 1), 1);
  v_shared    boolean;
  r_res       record;
  v_from      timestamptz;
  v_to        timestamptz;
  v_cursor    timestamptz;
  v_end       timestamptz;
  v_used      integer;
  v_off       boolean;
begin
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then return; end if;

  -- A party bigger than the booking allows is refused before any date work.
  if v_party > greatest(v_service.max_party, v_service.min_party) then return; end if;

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
  v_capacity := greatest(coalesce(v_service.capacity, 1), 1);
  -- A class sells seats inside one session; everything else takes the slot.
  v_shared   := v_service.booking_mode = 'class';

  select count(*) into v_assigned
    from public.service_resources where service_id = p_service_id;

  -- ── people-based: one lane per assigned person ──────────────────────
  if v_assigned > 0 then
    for r_res in
      select r.id, r.name
        from public.resources r
        join public.service_resources sr
          on sr.resource_id = r.id and sr.service_id = p_service_id
       where r.user_id = p_user_id
         and r.active
         and (p_resource_id is null or r.id = p_resource_id)
       order by r.created_at
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

        if v_shared then
          -- Seats this person has already sold in the overlapping window.
          select coalesce(sum(a.party_size), 0) into v_used
            from public.appointments a
           where a.user_id = p_user_id and a.resource_id = r_res.id
             and a.status in ('booked','confirmed')
             and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_end);

          if v_capacity - v_used >= v_party then
            slot_start := v_cursor; slot_end := v_end;
            resource_id := r_res.id; resource_name := r_res.name;
            seats_left := v_capacity - v_used;
            return next;
          end if;
        else
          -- One person, one booking at a time.
          select count(*) into v_used
            from public.appointments a
           where a.user_id = p_user_id and a.resource_id = r_res.id
             and a.status in ('booked','confirmed')
             and tstzrange(a.starts_at, a.ends_at)
                 && tstzrange(v_cursor, v_cursor + make_interval(mins => v_total));

          if v_used = 0 then
            slot_start := v_cursor; slot_end := v_end;
            resource_id := r_res.id; resource_name := r_res.name;
            seats_left := 1;
            return next;
          end if;
        end if;
      end loop;
    end loop;
    return;
  end if;

  -- ── no people: one pool of `capacity` and no resource on the booking ──
  -- Asking for a specific person when the service has none is a contradiction.
  if p_resource_id is not null then return; end if;

  for v_cursor in
    select gs from generate_series(
             v_shop_open,
             v_shop_shut - make_interval(mins => v_total),
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
    if v_cursor < v_shop_open or v_cursor + make_interval(mins => v_total) > v_shop_shut then continue; end if;
    if v_cursor < v_earliest then continue; end if;

    if v_shared then
      -- Seats sold across the whole service in this window.
      select coalesce(sum(a.party_size), 0) into v_used
        from public.appointments a
       where a.user_id = p_user_id and a.service_id = p_service_id
         and a.status in ('booked','confirmed')
         and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_end);

      if v_capacity - v_used >= v_party then
        slot_start := v_cursor; slot_end := v_end;
        resource_id := null; resource_name := null;
        seats_left := v_capacity - v_used;
        return next;
      end if;
    else
      -- How many of the thing are busy: 20 of 22 tables leaves 2.
      select count(*) into v_used
        from public.appointments a
       where a.user_id = p_user_id and a.service_id = p_service_id
         and a.status in ('booked','confirmed')
         and tstzrange(a.starts_at, a.ends_at)
             && tstzrange(v_cursor, v_cursor + make_interval(mins => v_total));

      if v_used < v_capacity then
        slot_start := v_cursor; slot_end := v_end;
        resource_id := null; resource_name := null;
        seats_left := v_capacity - v_used;
        return next;
      end if;
    end if;
  end loop;
end $$;

-- ── booking follows the same two shapes ────────────────────────────────
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
  v_slot     record;
  v_found    boolean := false;
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

  -- Re-check inside the lock: the slot has to still be on offer. The resource
  -- may legitimately come back null, so a separate flag says whether a row
  -- was found rather than inferring it from the id.
  for v_slot in
    select s.resource_id
      from public.available_slots(
        p_user_id, p_service_id,
        (p_starts_at at time zone p_timezone)::date,
        p_resource_id, p_timezone, v_party) s
     where s.slot_start = p_starts_at
     limit 1
  loop
    v_found := true;
  end loop;

  if not v_found then raise exception 'slot_taken'; end if;

  insert into public.appointments
    (user_id, service_id, resource_id, conversation_id, customer_name,
     customer_contact, starts_at, ends_at, price, currency, note, party_size)
  values
    (p_user_id, p_service_id, v_slot.resource_id, p_conversation_id, p_customer_name,
     p_customer_contact, p_starts_at, v_end, v_service.price, v_service.currency,
     p_note, v_party)
  returning * into v_row;

  return v_row;
end $$;

-- ── search keeps exposing the column under its new name ────────────────
drop function if exists public.match_services(extensions.vector, integer, uuid);
create function public.match_services(
  query_embedding extensions.vector,
  match_count     integer default 6,
  filter_user_id  uuid    default null
)
returns table (
  id uuid, name text, description text, category text,
  duration_min integer, buffer_min integer, price numeric, currency text,
  capacity integer, image_url text, masters text,
  booking_mode text, min_party integer, max_party integer,
  similarity double precision
)
language sql stable as $$
  select s.id, s.name, s.description, s.category,
         s.duration_min, s.buffer_min, s.price, s.currency, s.capacity,
         s.image_url,
         (select string_agg(r.name, ', ' order by r.name)
            from public.service_resources sr
            join public.resources r on r.id = sr.resource_id
           where sr.service_id = s.id and r.active) as masters,
         s.booking_mode, s.min_party, s.max_party,
         1 - (s.embedding <=> query_embedding) as similarity
    from public.services s
   where s.active
     and s.embedding is not null
     and (filter_user_id is null or s.user_id = filter_user_id)
   order by s.embedding <=> query_embedding
   limit greatest(match_count, 1)
$$;
