-- ════════════════════════════════════════════════════════════════════════
-- Exact times.
--
-- The slot grid decided both what we OFFER and what is POSSIBLE, so a guest
-- who wanted 19:00 was told to take 18:30 or 19:30 even with twenty tables
-- free. No restaurant works that way: the grid is a way of suggesting times,
-- not a rule about which minutes exist.
--
-- So availability keeps producing tidy suggestions, and a specific request is
-- now checked against what actually constrains it — open hours, lead time,
-- capacity, and whether the person is free.
-- ════════════════════════════════════════════════════════════════════════

alter table public.services
  add column if not exists allow_any_time boolean not null default true;

comment on column public.services.allow_any_time is
  'Accept a time the customer names even when it is off the suggestion grid, '
  'as long as there is room. Turn off for anything that must start on the '
  'grid, like a class everyone joins at once.';

-- Fixed start times are a real constraint, not a suggestion: a class that
-- begins at 10:00 cannot begin at 10:07.
update public.services set allow_any_time = false where slot_mode = 'fixed';

/**
 * Can this exact instant be booked?
 *
 * Returns one row. `ok` false comes with a `reason` the caller can turn into
 * something a customer understands.
 */
create or replace function public.check_slot(
  p_user_id     uuid,
  p_service_id  uuid,
  p_starts_at   timestamptz,
  p_resource_id uuid    default null,
  p_timezone    text    default 'Asia/Almaty',
  p_party       integer default 1
)
returns table (ok boolean, reason text, resource_id uuid, seats_left integer)
language plpgsql stable as $$
declare
  v_service   public.services%rowtype;
  v_hours     public.business_hours%rowtype;
  v_day       date;
  v_weekday   smallint;
  v_open      timestamptz;
  v_shut      timestamptz;
  v_end       timestamptz;
  v_block_end timestamptz;
  v_party     integer := greatest(coalesce(p_party, 1), 1);
  v_capacity  integer;
  v_shared    boolean;
  v_assigned  integer;
  v_used      integer;
  v_from      timestamptz;
  v_to        timestamptz;
  v_off       boolean;
  r_res       record;
begin
  ok := false; reason := 'unknown'; resource_id := null; seats_left := 0;

  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then reason := 'service_not_found'; return next; return; end if;

  if v_party < v_service.min_party
     or v_party > greatest(v_service.max_party, v_service.min_party) then
    reason := 'party_out_of_range'; return next; return;
  end if;

  v_day     := (p_starts_at at time zone p_timezone)::date;
  v_weekday := extract(dow from v_day)::smallint;
  v_end     := p_starts_at + make_interval(mins => v_service.duration_min);
  v_block_end := p_starts_at + make_interval(mins => v_service.duration_min + v_service.buffer_min);

  -- A fixed-time service only starts when it says it starts.
  if v_service.slot_mode = 'fixed' then
    if not exists (
      select 1 from unnest(coalesce(v_service.slot_times, '{}'::time[])) tm
       where (v_day + tm) at time zone p_timezone = p_starts_at
    ) then
      reason := 'not_a_start_time'; return next; return;
    end if;
  end if;

  select * into v_hours from public.business_hours
   where user_id = p_user_id and weekday = v_weekday;

  if not found then
    v_open := (v_day + time '09:00') at time zone p_timezone;
    v_shut := (v_day + time '18:00') at time zone p_timezone;
  elsif v_hours.closed then
    reason := 'closed_that_day'; return next; return;
  else
    v_open := (v_day + v_hours.opens)  at time zone p_timezone;
    v_shut := (v_day + v_hours.closes) at time zone p_timezone;
  end if;

  if p_starts_at < v_open or v_block_end > v_shut then
    reason := 'outside_hours'; return next; return;
  end if;

  if p_starts_at < now() + make_interval(mins => v_service.lead_time_min) then
    reason := 'too_soon'; return next; return;
  end if;

  v_capacity := greatest(coalesce(v_service.capacity, 1), 1);
  v_shared   := v_service.booking_mode = 'class';

  select count(*) into v_assigned
    from public.service_resources where service_id = p_service_id;

  -- ── somebody has to do it ──
  if v_assigned > 0 then
    for r_res in
      select r.id, r.name
        from public.resources r
        join public.service_resources sr
          on sr.resource_id = r.id and sr.service_id = p_service_id
       where r.user_id = p_user_id and r.active
         and (p_resource_id is null or r.id = p_resource_id)
       order by r.created_at
    loop
      select
        coalesce(greatest(v_open, (v_day + rh.starts_at) at time zone p_timezone), v_open),
        coalesce(least   (v_shut, (v_day + rh.ends_at)   at time zone p_timezone), v_shut),
        rh.off
      into v_from, v_to, v_off
      from public.resource_hours rh
      where rh.resource_id = r_res.id and rh.weekday = v_weekday;

      if found then
        if v_off then continue; end if;
      else
        v_from := v_open; v_to := v_shut;
      end if;

      if p_starts_at < v_from or v_block_end > v_to then continue; end if;

      if v_shared then
        select coalesce(sum(a.party_size), 0) into v_used
          from public.appointments a
         where a.user_id = p_user_id and a.resource_id = r_res.id
           and a.status in ('booked','confirmed')
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_end);

        if v_capacity - v_used >= v_party then
          ok := true; reason := 'free'; resource_id := r_res.id;
          seats_left := v_capacity - v_used; return next; return;
        end if;
      else
        select count(*) into v_used
          from public.appointments a
         where a.user_id = p_user_id and a.resource_id = r_res.id
           and a.status in ('booked','confirmed')
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_block_end);

        if v_used = 0 then
          ok := true; reason := 'free'; resource_id := r_res.id;
          seats_left := 1; return next; return;
        end if;
      end if;
    end loop;

    reason := case when p_resource_id is null then 'all_busy' else 'person_busy' end;
    return next; return;
  end if;

  -- ── nobody attached: it is a question of how many are left ──
  if p_resource_id is not null then reason := 'no_such_person'; return next; return; end if;

  if v_shared then
    select coalesce(sum(a.party_size), 0) into v_used
      from public.appointments a
     where a.user_id = p_user_id and a.service_id = p_service_id
       and a.status in ('booked','confirmed')
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_end);

    if v_capacity - v_used >= v_party then
      ok := true; reason := 'free'; seats_left := v_capacity - v_used; return next; return;
    end if;
    seats_left := greatest(v_capacity - v_used, 0);
    reason := 'no_seats_left'; return next; return;
  end if;

  select count(*) into v_used
    from public.appointments a
   where a.user_id = p_user_id and a.service_id = p_service_id
     and a.status in ('booked','confirmed')
     and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_block_end);

  if v_used < v_capacity then
    ok := true; reason := 'free'; seats_left := v_capacity - v_used; return next; return;
  end if;

  reason := 'all_busy'; return next; return;
end $$;

-- ── booking asks "is this time possible", not "is it on my list" ───────
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
  v_service public.services%rowtype;
  v_check   record;
  v_end     timestamptz;
  v_party   integer := greatest(coalesce(p_party, 1), 1);
  v_row     public.appointments%rowtype;
  v_ongrid  boolean;
begin
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then raise exception 'service_not_found'; end if;

  v_end := p_starts_at + make_interval(mins => v_service.duration_min);

  perform pg_advisory_xact_lock(hashtextextended(p_service_id::text, 0));

  -- Re-checked inside the lock, so two people cannot take the last table.
  select * into v_check
    from public.check_slot(p_user_id, p_service_id, p_starts_at,
                           p_resource_id, p_timezone, v_party);

  if not v_check.ok then
    if v_check.reason = 'party_out_of_range' then
      raise exception 'party_out_of_range:%:%', v_service.min_party, v_service.max_party;
    end if;
    raise exception 'slot_taken:%', v_check.reason;
  end if;

  -- A business that insists on its grid still gets its grid.
  if not v_service.allow_any_time then
    select exists (
      select 1 from public.available_slots(
        p_user_id, p_service_id, (p_starts_at at time zone p_timezone)::date,
        p_resource_id, p_timezone, v_party) s
       where s.slot_start = p_starts_at
    ) into v_ongrid;
    if not v_ongrid then raise exception 'slot_taken:off_grid'; end if;
  end if;

  insert into public.appointments
    (user_id, service_id, resource_id, conversation_id, customer_name,
     customer_contact, starts_at, ends_at, price, currency, note, party_size)
  values
    (p_user_id, p_service_id, v_check.resource_id, p_conversation_id, p_customer_name,
     p_customer_contact, p_starts_at, v_end, v_service.price, v_service.currency,
     p_note, v_party)
  returning * into v_row;

  return v_row;
end $$;
