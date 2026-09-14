-- Orders and stock move together or not at all. Doing this in application
-- code meant an order could be written while the stock decrement failed,
-- leaving the ledger and the shelf disagreeing.
drop function if exists public.record_order(uuid, jsonb, text, uuid, text, text, text);
create function public.record_order(
  p_user_id          uuid,
  p_items            jsonb,          -- [{product_id?, title, quantity, price}]
  p_currency         text default 'kzt',
  p_conversation_id  uuid default null,
  p_customer_name    text default null,
  p_customer_contact text default null,
  p_note             text default null
)
returns public.orders
language plpgsql as $$
declare
  v_item     jsonb;
  v_pid      uuid;
  v_qty      integer;
  v_stock    integer;
  v_track    boolean;
  v_name     text;
  v_total    numeric := 0;
  v_order    public.orders%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items';
  end if;

  -- Pass 1: validate stock before writing anything.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := nullif(v_item->>'product_id','')::uuid;
    v_qty := greatest(coalesce((v_item->>'quantity')::integer, 1), 1);

    if v_pid is not null then
      select stock, track_stock, name into v_stock, v_track, v_name
        from public.products
       where id = v_pid and user_id = p_user_id
       for update;

      if not found then
        raise exception 'unknown_product:%', v_pid;
      end if;
      if v_track and v_stock < v_qty then
        raise exception 'insufficient_stock:%:%', v_name, v_stock;
      end if;
    end if;

    v_total := v_total + (coalesce((v_item->>'price')::numeric, 0) * v_qty);
  end loop;

  insert into public.orders
    (user_id, conversation_id, customer_name, customer_contact, items, total, currency, note)
  values
    (p_user_id, p_conversation_id, p_customer_name, p_customer_contact,
     p_items, v_total, lower(coalesce(p_currency,'kzt')), p_note)
  returning * into v_order;

  -- Pass 2: move the stock and write the ledger.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := nullif(v_item->>'product_id','')::uuid;
    v_qty := greatest(coalesce((v_item->>'quantity')::integer, 1), 1);

    if v_pid is not null then
      update public.products
         set stock = stock - v_qty, updated_at = now()
       where id = v_pid and user_id = p_user_id and track_stock;

      if found then
        insert into public.stock_movements (user_id, product_id, delta, reason, order_id)
        values (p_user_id, v_pid, -v_qty, 'order', v_order.id);
      end if;
    end if;
  end loop;

  return v_order;
end $$;

-- Restocking a cancelled order puts the goods back.
drop function if exists public.cancel_order(uuid, uuid);
create function public.cancel_order(p_user_id uuid, p_order_id uuid)
returns public.orders
language plpgsql as $$
declare
  v_order public.orders%rowtype;
  v_item  jsonb;
  v_pid   uuid;
  v_qty   integer;
begin
  select * into v_order from public.orders
   where id = p_order_id and user_id = p_user_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'cancelled' then return v_order; end if;

  for v_item in select * from jsonb_array_elements(v_order.items) loop
    v_pid := nullif(v_item->>'product_id','')::uuid;
    v_qty := greatest(coalesce((v_item->>'quantity')::integer, 1), 1);
    if v_pid is not null then
      update public.products set stock = stock + v_qty, updated_at = now()
       where id = v_pid and user_id = p_user_id and track_stock;
      if found then
        insert into public.stock_movements (user_id, product_id, delta, reason, order_id, note)
        values (p_user_id, v_pid, v_qty, 'return', v_order.id, 'order cancelled');
      end if;
    end if;
  end loop;

  update public.orders set status = 'cancelled' where id = p_order_id returning * into v_order;
  return v_order;
end $$;
