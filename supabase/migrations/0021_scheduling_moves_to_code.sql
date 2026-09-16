-- ════════════════════════════════════════════════════════════════════════
-- The booking rules move into the application.
--
-- Opening hours, shifts, step grids, lead times and party sizes now live in
-- src/lib/booking/schedule.js, where they are ordinary functions with
-- ordinary tests. They were in here, untested and unbuildable, and shipped
-- three bugs in a row — including offer and check anchoring their grids to
-- different times, which made a whole service unbookable.
--
-- What stays is the one thing JavaScript cannot do: decide and insert in a
-- single transaction. supabase-js has no transaction API, so without this
-- two customers can both read "one table left" and both book it.
--
-- claim_appointment knows nothing about opening hours. It re-checks capacity
-- under a lock and writes the row.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.available_slots(uuid, uuid, date, uuid, text, integer);
drop function if exists public.check_slot(uuid, uuid, timestamptz, uuid, text, integer);
drop function if exists public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, text, text, text, integer);

create or replace function public.claim_appointment(
  p_user_id          uuid,
  p_service_id       uuid,
  p_resource_id      uuid,
  p_starts_at        timestamptz,
  p_party            integer default 1,
  p_conversation_id  uuid default null,
  p_customer_name    text default null,
  p_customer_contact text default null,
  p_note             text default null
)
returns public.appointments
language plpgsql as $$
declare
  v_service   public.services%rowtype;
  v_party     integer := greatest(coalesce(p_party, 1), 1);
  v_end       timestamptz;
  v_block_end timestamptz;
  v_capacity  integer;
  v_used      integer;
  v_row       public.appointments%rowtype;
begin
  -- Read the service here rather than trusting numbers from the caller.
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then raise exception 'service_not_found'; end if;

  if v_party < v_service.min_party
     or v_party > greatest(v_service.max_party, v_service.min_party) then
    raise exception 'party_out_of_range:%:%', v_service.min_party, v_service.max_party;
  end if;

  v_end       := p_starts_at + make_interval(mins => v_service.duration_min);
  v_block_end := v_end + make_interval(mins => coalesce(v_service.buffer_min, 0));
  v_capacity  := greatest(coalesce(v_service.capacity, 1), 1);

  -- Serialise everyone booking this service for the moment it takes to look
  -- and write. Without it the check below is advice, not a guarantee.
  perform pg_advisory_xact_lock(hashtextextended(p_service_id::text, 0));

  if v_service.booking_mode = 'class' then
    select coalesce(sum(a.party_size), 0) into v_used
      from public.appointments a
     where a.user_id = p_user_id
       and a.status in ('booked','confirmed')
       and (case when p_resource_id is null
                 then a.service_id = p_service_id
                 else a.resource_id = p_resource_id end)
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_end);

    if v_capacity - v_used < v_party then raise exception 'slot_taken:no_seats_left'; end if;
  else
    -- A booking holds its own cleanup time, so compare against end + buffer
    -- on both sides.
    select count(*) into v_used
      from public.appointments a
     where a.user_id = p_user_id
       and a.status in ('booked','confirmed')
       and (case when p_resource_id is null
                 then a.service_id = p_service_id
                 else a.resource_id = p_resource_id end)
       and tstzrange(a.starts_at, a.ends_at + make_interval(mins => coalesce(v_service.buffer_min, 0)))
           && tstzrange(p_starts_at, v_block_end);

    if v_used >= v_capacity then raise exception 'slot_taken:all_busy'; end if;
  end if;

  insert into public.appointments
    (user_id, service_id, resource_id, conversation_id, customer_name,
     customer_contact, starts_at, ends_at, price, currency, note, party_size)
  values
    (p_user_id, p_service_id, p_resource_id, p_conversation_id, p_customer_name,
     p_customer_contact, p_starts_at, v_end, v_service.price, v_service.currency,
     p_note, v_party)
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.claim_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text) from public, anon;
grant execute on function public.claim_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text) to authenticated, service_role;
