-- ════════════════════════════════════════════════════════════════════════
-- Move product/service knowledge entries into the real catalogue tables,
-- then add the search + booking functions the bot needs.
-- ════════════════════════════════════════════════════════════════════════

-- Nothing is thrown away: the source rows are archived before being removed.
create table if not exists public.knowledge_entries_archive
  (like public.knowledge_entries including all);

insert into public.knowledge_entries_archive
select * from public.knowledge_entries
where type in ('product','service')
  and not exists (
    select 1 from public.knowledge_entries_archive a where a.id = knowledge_entries.id
  );

-- ── product entries → products ─────────────────────────────────────────
insert into public.products (user_id, name, description, price, currency, stock, active, embedding, created_at)
select
  ke.user_id,
  ke.title,
  ke.content,
  coalesce(nullif(ke.metadata->>'price','')::numeric, 0),
  coalesce(nullif(ke.metadata->>'currency',''), 'kzt'),
  0,
  coalesce(ke.active, true),
  ke.embedding,
  ke.created_at
from public.knowledge_entries ke
where ke.type = 'product'
  and not exists (
    select 1 from public.products p where p.user_id = ke.user_id and p.name = ke.title
  );

-- ── service entries → services ─────────────────────────────────────────
insert into public.services (user_id, name, description, price, currency, duration_min, active, embedding, created_at)
select
  ke.user_id,
  ke.title,
  ke.content,
  coalesce(nullif(ke.metadata->>'price','')::numeric, 0),
  coalesce(nullif(ke.metadata->>'currency',''), 'kzt'),
  coalesce(nullif(ke.metadata->>'duration','')::integer, 60),
  coalesce(ke.active, true),
  ke.embedding,
  ke.created_at
from public.knowledge_entries ke
where ke.type = 'service'
  and not exists (
    select 1 from public.services s where s.user_id = ke.user_id and s.name = ke.title
  );

delete from public.knowledge_entries where type in ('product','service');

-- The knowledge base is now reference material only.
alter table public.knowledge_entries drop constraint if exists knowledge_entries_type_check;
alter table public.knowledge_entries
  add constraint knowledge_entries_type_check
  check (type in ('faq','flow','policy','template'));

-- ── vector search over services ────────────────────────────────────────
drop function if exists public.match_services(extensions.vector, integer, uuid);
create function public.match_services(
  query_embedding extensions.vector,
  match_count     integer default 6,
  filter_user_id  uuid    default null
)
returns table (
  id uuid, name text, description text, category text,
  duration_min integer, buffer_min integer, price numeric, currency text,
  max_parallel integer, similarity double precision
)
language sql stable as $$
  select s.id, s.name, s.description, s.category,
         s.duration_min, s.buffer_min, s.price, s.currency, s.max_parallel,
         1 - (s.embedding <=> query_embedding)
  from public.services s
  where s.embedding is not null
    and s.active is true
    and (filter_user_id is null or s.user_id = filter_user_id)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

-- products search, refreshed to return the new columns
drop function if exists public.match_products(extensions.vector, integer, uuid);
create function public.match_products(
  query_embedding extensions.vector,
  match_count     integer default 6,
  filter_user_id  uuid    default null
)
returns table (
  id uuid, name text, description text, price numeric, currency text,
  stock integer, track_stock boolean, similarity double precision
)
language sql stable as $$
  select p.id, p.name, p.description, p.price, p.currency,
         p.stock, p.track_stock,
         1 - (p.embedding <=> query_embedding)
  from public.products p
  where p.embedding is not null
    and p.active is true
    and (filter_user_id is null or p.user_id = filter_user_id)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- ── free slots for a service on a given local day ──────────────────────
-- Returns start times that fit the service (plus its buffer) inside opening
-- hours without exceeding max_parallel, and that a given master is free for.
drop function if exists public.available_slots(uuid, uuid, date, uuid, integer, text);
create function public.available_slots(
  p_user_id    uuid,
  p_service_id uuid,
  p_day        date,
  p_staff_id   uuid    default null,
  p_step_min   integer default 15,
  p_timezone   text    default 'Asia/Almaty'
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable as $$
declare
  v_service   public.services%rowtype;
  v_hours     public.business_hours%rowtype;
  v_total     integer;
  v_open      timestamptz;
  v_close     timestamptz;
  v_cursor    timestamptz;
  v_slot_end  timestamptz;
  v_taken     integer;
begin
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then return; end if;

  select * into v_hours from public.business_hours
   where user_id = p_user_id and weekday = extract(dow from p_day)::smallint;

  -- No configured hours for this weekday: fall back to 09:00–18:00.
  if not found then
    v_open  := (p_day + time '09:00') at time zone p_timezone;
    v_close := (p_day + time '18:00') at time zone p_timezone;
  elsif v_hours.closed then
    return;
  else
    v_open  := (p_day + v_hours.opens)  at time zone p_timezone;
    v_close := (p_day + v_hours.closes) at time zone p_timezone;
  end if;

  v_total  := v_service.duration_min + v_service.buffer_min;
  v_cursor := v_open;

  while v_cursor + make_interval(mins => v_total) <= v_close loop
    v_slot_end := v_cursor + make_interval(mins => v_service.duration_min);

    if p_staff_id is not null then
      select count(*) into v_taken from public.appointments a
       where a.user_id = p_user_id
         and a.staff_id = p_staff_id
         and a.status in ('booked','confirmed')
         and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_slot_end);
    else
      select count(*) into v_taken from public.appointments a
       where a.user_id = p_user_id
         and a.service_id = p_service_id
         and a.status in ('booked','confirmed')
         and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_slot_end);
    end if;

    if (p_staff_id is not null and v_taken = 0)
       or (p_staff_id is null and v_taken < v_service.max_parallel) then
      slot_start := v_cursor;
      slot_end   := v_slot_end;
      return next;
    end if;

    v_cursor := v_cursor + make_interval(mins => p_step_min);
  end loop;
end $$;

-- ── atomic booking ─────────────────────────────────────────────────────
-- Re-checks capacity while holding a lock, so two customers racing for the
-- last slot cannot both win.
drop function if exists public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, text, text);
create function public.book_appointment(
  p_user_id         uuid,
  p_service_id      uuid,
  p_starts_at       timestamptz,
  p_staff_id        uuid default null,
  p_conversation_id uuid default null,
  p_customer_name   text default null,
  p_customer_contact text default null,
  p_note            text default null
)
returns public.appointments
language plpgsql as $$
declare
  v_service public.services%rowtype;
  v_end     timestamptz;
  v_taken   integer;
  v_row     public.appointments%rowtype;
begin
  select * into v_service from public.services
   where id = p_service_id and user_id = p_user_id and active;
  if not found then
    raise exception 'service_not_found';
  end if;

  v_end := p_starts_at + make_interval(mins => v_service.duration_min);

  -- Serialise bookings per service; the advisory lock is released at commit.
  perform pg_advisory_xact_lock(hashtextextended(p_service_id::text, 0));

  if p_staff_id is not null then
    select count(*) into v_taken from public.appointments a
     where a.user_id = p_user_id and a.staff_id = p_staff_id
       and a.status in ('booked','confirmed')
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_end);
    if v_taken > 0 then raise exception 'slot_taken'; end if;
  else
    select count(*) into v_taken from public.appointments a
     where a.user_id = p_user_id and a.service_id = p_service_id
       and a.status in ('booked','confirmed')
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_end);
    if v_taken >= v_service.max_parallel then raise exception 'slot_taken'; end if;
  end if;

  insert into public.appointments
    (user_id, service_id, staff_id, conversation_id, customer_name,
     customer_contact, starts_at, ends_at, price, currency, note)
  values
    (p_user_id, p_service_id, p_staff_id, p_conversation_id, p_customer_name,
     p_customer_contact, p_starts_at, v_end, v_service.price, v_service.currency, p_note)
  returning * into v_row;

  return v_row;
end $$;
