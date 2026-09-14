-- Images belong to the catalogue the bot reads from, so the search functions
-- have to return them — otherwise the assistant can describe a product it
-- cannot show.
drop function if exists public.match_products(extensions.vector, integer, uuid);
create function public.match_products(
  query_embedding extensions.vector,
  match_count     integer default 6,
  filter_user_id  uuid    default null
)
returns table (
  id uuid, name text, description text, price numeric, currency text,
  stock integer, track_stock boolean, image_url text, similarity double precision
)
language sql stable as $$
  select p.id, p.name, p.description, p.price, p.currency,
         p.stock, p.track_stock, p.image_url,
         1 - (p.embedding <=> query_embedding)
  from public.products p
  where p.embedding is not null
    and p.active is true
    and (filter_user_id is null or p.user_id = filter_user_id)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

drop function if exists public.match_services(extensions.vector, integer, uuid);
create function public.match_services(
  query_embedding extensions.vector,
  match_count     integer default 6,
  filter_user_id  uuid    default null
)
returns table (
  id uuid, name text, description text, category text,
  duration_min integer, buffer_min integer, price numeric, currency text,
  max_parallel integer, image_url text, masters text, similarity double precision
)
language sql stable as $$
  select s.id, s.name, s.description, s.category,
         s.duration_min, s.buffer_min, s.price, s.currency, s.max_parallel,
         s.image_url,
         -- who can actually perform it; empty means anyone
         (select string_agg(st.name, ', ' order by st.name)
            from public.service_staff ss
            join public.staff st on st.id = ss.staff_id and st.active
           where ss.service_id = s.id) as masters,
         1 - (s.embedding <=> query_embedding)
  from public.services s
  where s.embedding is not null
    and s.active is true
    and (filter_user_id is null or s.user_id = filter_user_id)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
