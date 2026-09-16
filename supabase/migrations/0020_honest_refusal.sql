-- ════════════════════════════════════════════════════════════════════════
-- Tell the truth about why a time was refused.
--
-- After 0019 an off-grid time fell out of the person loop and was reported as
-- 'all_busy'. The assistant dutifully told the customer the slot had just been
-- taken — the exact fiction that started this. A time nobody starts at is now
-- reported as off_grid, and 'all_busy' means what it says.
-- ════════════════════════════════════════════════════════════════════════

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
  v_service    public.services%rowtype;
  v_hours      public.business_hours%rowtype;
  v_day        date;
  v_weekday    smallint;
  v_open       timestamptz;
  v_shut       timestamptz;
  v_end        timestamptz;
  v_block_end  timestamptz;
  v_party      integer := greatest(coalesce(p_party, 1), 1);
  v_capacity   integer;
  v_shared     boolean;
  v_assigned   integer;
  v_used       integer;
  v_step       integer;
  v_from       timestamptz;
  v_to         timestamptz;
  v_off        boolean;
  v_any_person boolean := false;   -- did anyone's shift even cover this time?
  v_on_grid    boolean := false;   -- and was it one of their start times?
  r_res        record;
begin
  ok := false; reason := 'unknown'; resource_id := null; seats_left := 0;

  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then reason := 'service_not_found'; return next; return; end if;

  if v_party < v_service.min_party
     or v_party > greatest(v_service.max_party, v_service.min_party) then
    reason := 'party_out_of_range'; return next; return;
  end if;

  v_day       := (p_starts_at at time zone p_timezone)::date;
  v_weekday   := extract(dow from v_day)::smallint;
  v_end       := p_starts_at + make_interval(mins => v_service.duration_min);
  v_block_end := p_starts_at + make_interval(mins => v_service.duration_min + v_service.buffer_min);
  v_step      := greatest(coalesce(v_service.slot_step_min, 30), 5) * 60;

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

  -- ── somebody does the work: their shift is the grid's origin ──────────
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
      v_any_person := true;

      -- Same origin available_slots counted from for this very person.
      if v_service.slot_mode = 'grid'
         and mod(extract(epoch from (p_starts_at - v_from))::bigint, v_step) <> 0 then
        continue;
      end if;
      v_on_grid := true;

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

    -- Nobody free is a different answer from "that is not a start time".
    -- Saying "fully booked" when the truth is "we do not start then" is
    -- what made the assistant invent a customer who took the slot first.
    if not v_any_person then
      reason := 'outside_hours';
    elsif not v_on_grid then
      reason := 'off_grid';
    else
      reason := case when p_resource_id is null then 'all_busy' else 'person_busy' end;
    end if;
    return next; return;
  end if;

  -- ── nobody attached: the shop's own opening is the origin ────────────
  if p_resource_id is not null then reason := 'no_such_person'; return next; return; end if;

  if v_service.slot_mode = 'grid'
     and mod(extract(epoch from (p_starts_at - v_open))::bigint, v_step) <> 0 then
    reason := 'off_grid'; return next; return;
  end if;

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
