-- ════════════════════════════════════════════════════════════════════════
-- Resettable stock.
--
-- A bookable table is just a product whose stock is how many of it exist:
-- "Table for 4" with 5 in stock is five tables, an order takes one, and the
-- existing insufficient_stock guard refuses the sixth. What a shop like that
-- needs that a shelf does not is putting the count back every service — so
-- products carry the number they start from, and a reset returns them to it.
-- ════════════════════════════════════════════════════════════════════════

alter table public.products
  add column if not exists initial_stock integer;

comment on column public.products.initial_stock is
  'Quantity a reset returns stock to. For tables, how many of them exist.';

-- Existing shops should be able to reset from day one.
update public.products set initial_stock = stock where initial_stock is null;

-- A reset is a real movement, so the ledger keeps explaining the shelf.
alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements
  add constraint stock_movements_reason_check
  check (reason in ('order', 'restock', 'correction', 'return', 'reset'));

/**
 * Put stock back to initial_stock.
 *
 * One product when p_product_id is given, otherwise every tracked product the
 * caller owns. Rows already at their baseline are skipped so a daily reset
 * does not fill the ledger with zero-delta noise.
 */
create or replace function public.reset_stock(
  p_user_id    uuid,
  p_product_id uuid default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_changed integer := 0;
  r_product record;
begin
  for r_product in
    select id, stock, coalesce(initial_stock, stock) as target
    from public.products
    where user_id = p_user_id
      and track_stock
      and (p_product_id is null or id = p_product_id)
      and stock is distinct from coalesce(initial_stock, stock)
    for update
  loop
    update public.products
    set stock = r_product.target, updated_at = now()
    where id = r_product.id;

    insert into public.stock_movements (user_id, product_id, delta, reason, note)
    values (p_user_id, r_product.id, r_product.target - r_product.stock, 'reset',
            'Availability reset');

    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$$;

revoke all on function public.reset_stock(uuid, uuid) from public, anon;
grant execute on function public.reset_stock(uuid, uuid) to authenticated, service_role;
