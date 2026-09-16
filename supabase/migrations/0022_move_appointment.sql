-- ════════════════════════════════════════════════════════════════════════
-- Moving a booking, atomically.
--
-- The scheduling rules live in code now; this is the same narrow guard as
-- claim_appointment. It re-checks capacity under a lock and writes — with the
-- one difference that a booking must not count itself as the thing blocking
-- its own new time.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.move_appointment(
  p_user_id       uuid,
  p_appointment_id uuid,
  p_starts_at     timestamptz,
  p_resource_id   uuid default null,
  p_party         integer default null
)
returns public.appointments
language plpgsql as $$
declare
  v_appt      public.appointments%rowtype;
  v_service   public.services%rowtype;
  v_party     integer;
  v_end       timestamptz;
  v_block_end timestamptz;
  v_capacity  integer;
  v_used      integer;
  v_row       public.appointments%rowtype;
begin
  select * into v_appt from public.appointments
   where id = p_appointment_id and user_id = p_user_id;
  if not found then raise exception 'appointment_not_found'; end if;

  if v_appt.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'appointment_closed:%', v_appt.status;
  end if;

  select * into v_service from public.services
   where id = v_appt.service_id and user_id = p_user_id and active;
  if not found then raise exception 'service_not_found'; end if;

  v_party := greatest(coalesce(p_party, v_appt.party_size, 1), 1);
  if v_party < v_service.min_party
     or v_party > greatest(v_service.max_party, v_service.min_party) then
    raise exception 'party_out_of_range:%:%', v_service.min_party, v_service.max_party;
  end if;

  v_end       := p_starts_at + make_interval(mins => v_service.duration_min);
  v_block_end := v_end + make_interval(mins => coalesce(v_service.buffer_min, 0));
  v_capacity  := greatest(coalesce(v_service.capacity, 1), 1);

  perform pg_advisory_xact_lock(hashtextextended(v_appt.service_id::text, 0));

  if v_service.booking_mode = 'class' then
    select coalesce(sum(a.party_size), 0) into v_used
      from public.appointments a
     where a.user_id = p_user_id
       and a.id <> p_appointment_id                    -- never block itself
       and a.status in ('booked','confirmed')
       and (case when p_resource_id is null
                 then a.service_id = v_appt.service_id
                 else a.resource_id = p_resource_id end)
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_end);

    if v_capacity - v_used < v_party then raise exception 'slot_taken:no_seats_left'; end if;
  else
    select count(*) into v_used
      from public.appointments a
     where a.user_id = p_user_id
       and a.id <> p_appointment_id
       and a.status in ('booked','confirmed')
       and (case when p_resource_id is null
                 then a.service_id = v_appt.service_id
                 else a.resource_id = p_resource_id end)
       and tstzrange(a.starts_at, a.ends_at + make_interval(mins => coalesce(v_service.buffer_min, 0)))
           && tstzrange(p_starts_at, v_block_end);

    if v_used >= v_capacity then raise exception 'slot_taken:all_busy'; end if;
  end if;

  update public.appointments
     set starts_at = p_starts_at,
         ends_at = v_end,
         resource_id = p_resource_id,
         party_size = v_party,
         updated_at = now()
   where id = p_appointment_id
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.move_appointment(uuid, uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.move_appointment(uuid, uuid, timestamptz, uuid, integer) to authenticated, service_role;
