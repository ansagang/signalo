-- ════════════════════════════════════════════════════════════════════════
-- Booking asks check_slot and nothing else.
--
-- 0015 had book_appointment re-scan available_slots to enforce the grid.
-- check_slot now owns that rule (0017), so the second scan is both dead
-- weight and a reference to a column that no longer exists.
-- ════════════════════════════════════════════════════════════════════════

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
