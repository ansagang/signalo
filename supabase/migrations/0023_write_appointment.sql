-- ════════════════════════════════════════════════════════════════════════
-- One write path for bookings.
--
-- 0021 added claim_appointment and 0022 added move_appointment, which was the
-- same function with "and not this one" in the capacity check. Two copies of a
-- guard is how the two copies of the grid rule started.
--
-- This is the whole of the booking logic that stays in the database: take a
-- lock, count what overlaps, insert or update. It knows nothing about opening
-- hours, shifts, grids or lead times — those are in src/lib/booking/schedule.js
-- with tests. It exists only because supabase-js has no transaction API, so
-- without a lock two customers can both read "one left" and both take it.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.claim_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text);
drop function if exists public.move_appointment(uuid, uuid, timestamptz, uuid, integer);

create or replace function public.write_appointment(
  p_user_id          uuid,
  p_service_id       uuid,
  p_starts_at        timestamptz,
  p_resource_id      uuid    default null,
  p_party            integer default 1,
  p_appointment_id   uuid    default null,   -- null inserts, otherwise moves
  p_conversation_id  uuid    default null,
  p_customer_name    text    default null,
  p_customer_contact text    default null,
  p_note             text    default null
)
returns public.appointments
language plpgsql as $$
declare
  v_existing  public.appointments%rowtype;
  v_service   public.services%rowtype;
  v_party     integer;
  v_end       timestamptz;
  v_block_end timestamptz;
  v_buffer    interval;
  v_capacity  integer;
  v_used      integer;
  v_row       public.appointments%rowtype;
begin
  if p_appointment_id is not null then
    select * into v_existing from public.appointments
     where id = p_appointment_id and user_id = p_user_id;
    if not found then raise exception 'appointment_not_found'; end if;
    if v_existing.status in ('cancelled', 'completed', 'no_show') then
      raise exception 'appointment_closed:%', v_existing.status;
    end if;
  end if;

  select * into v_service from public.services
   where id = coalesce(v_existing.service_id, p_service_id)
     and user_id = p_user_id and active;
  if not found then raise exception 'service_not_found'; end if;

  v_party := greatest(coalesce(p_party, v_existing.party_size, 1), 1);
  if v_party < v_service.min_party
     or v_party > greatest(v_service.max_party, v_service.min_party) then
    raise exception 'party_out_of_range:%:%', v_service.min_party, v_service.max_party;
  end if;

  v_buffer    := make_interval(mins => coalesce(v_service.buffer_min, 0));
  v_end       := p_starts_at + make_interval(mins => v_service.duration_min);
  v_block_end := v_end + v_buffer;
  v_capacity  := greatest(coalesce(v_service.capacity, 1), 1);

  -- Everyone booking this service queues here for the moment it takes to
  -- look and write. Without it the check below is advice, not a guarantee.
  perform pg_advisory_xact_lock(hashtextextended(v_service.id::text, 0));

  if v_service.booking_mode = 'class' then
    -- Seats are people: add up the parties already sharing the sitting.
    select coalesce(sum(a.party_size), 0) into v_used
      from public.appointments a
     where a.user_id = p_user_id
       and a.status in ('booked','confirmed')
       and (p_appointment_id is null or a.id <> p_appointment_id)
       and (case when p_resource_id is null
                 then a.service_id = v_service.id
                 else a.resource_id = p_resource_id end)
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_end);

    if v_capacity - v_used < v_party then raise exception 'slot_taken:no_seats_left'; end if;
  else
    -- Exclusive: a party of four takes one table, not four. A booking also
    -- holds its own cleanup time, so the buffer applies to both sides.
    select count(*) into v_used
      from public.appointments a
     where a.user_id = p_user_id
       and a.status in ('booked','confirmed')
       and (p_appointment_id is null or a.id <> p_appointment_id)
       and (case when p_resource_id is null
                 then a.service_id = v_service.id
                 else a.resource_id = p_resource_id end)
       and tstzrange(a.starts_at, a.ends_at + v_buffer) && tstzrange(p_starts_at, v_block_end);

    if v_used >= v_capacity then raise exception 'slot_taken:all_busy'; end if;
  end if;

  if p_appointment_id is null then
    insert into public.appointments
      (user_id, service_id, resource_id, conversation_id, customer_name,
       customer_contact, starts_at, ends_at, price, currency, note, party_size)
    values
      (p_user_id, v_service.id, p_resource_id, p_conversation_id, p_customer_name,
       p_customer_contact, p_starts_at, v_end, v_service.price, v_service.currency,
       p_note, v_party)
    returning * into v_row;
  else
    update public.appointments
       set starts_at = p_starts_at,
           ends_at = v_end,
           resource_id = p_resource_id,
           party_size = v_party,
           updated_at = now()
     where id = p_appointment_id
    returning * into v_row;
  end if;

  return v_row;
end $$;

revoke all on function public.write_appointment(uuid, uuid, timestamptz, uuid, integer, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.write_appointment(uuid, uuid, timestamptz, uuid, integer, uuid, uuid, text, text, text) to authenticated, service_role;
