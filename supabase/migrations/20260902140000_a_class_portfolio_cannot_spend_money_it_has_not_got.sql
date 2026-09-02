-- A class portfolio cannot spend money it has not got.
--
-- `portfell_apply_cash_delta` moves a balance by a delta, atomically, which
-- is the whole reason it exists (migration 041: two writers reading one
-- starting figure and the second overwriting the first). What it has never
-- had is a floor, and it was right not to have one: on an ordinary portfolio
-- cash below zero is a broker's loan, which is an ordinary way to hold
-- something and which this product shows deliberately.
--
-- A classroom paper portfolio is a different thing. It has starting money the
-- teacher sets, no broker behind it, and a league that ranks students on what
-- their portfolio is worth against what they began with. A student who can go
-- to minus a million can buy a million dollars of anything and finish first,
-- and every figure on every screen adds up correctly afterwards, because the
-- arithmetic was never wrong. Only the premise was.
--
-- The route already refuses a student setting their own cash and prices a
-- paper buy at the market rather than at whatever the request said. This is
-- the floor under both, and it is here rather than in Node for the same
-- reason the delta is: a check in the app is a read and then an act, and two
-- overlapping buys both read the same balance and both pass.
--
-- Deliberately only for a portfolio with a classroom_community_id. Nothing
-- about a real portfolio changes, in either direction.

create or replace function public.portfell_apply_cash_delta(
  p_portfolio_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balance numeric;
  uid uuid := auth.uid();
  is_class boolean;
begin
  if p_portfolio_id is null then
    raise exception 'portfolio id required';
  end if;

  -- uid is null for the service-role connection the API routes use; any other
  -- caller has to prove co-ownership of this sheet.
  if uid is not null and not public.portfell_is_portfolio_co_owner(p_portfolio_id) then
    raise exception 'not a co-owner of this portfolio';
  end if;

  if p_delta is null or p_delta = 0 then
    select cash_balance into next_balance
    from public.portfell_portfolios
    where id = p_portfolio_id;
    return next_balance;
  end if;

  update public.portfell_portfolios
  set cash_balance = round(
        (coalesce(cash_balance, 0) + round(p_delta::numeric, 2))::numeric, 2
      ),
      updated_at = now()
  where id = p_portfolio_id
  returning cash_balance, classroom_community_id is not null
  into next_balance, is_class;

  -- Raised after the update and inside the same transaction, so the write is
  -- rolled back with it. Checking first would be the read-then-act this
  -- function exists to avoid, and would let two overlapping buys both pass.
  if is_class and next_balance < 0 then
    raise exception 'not enough cash in this class portfolio'
      using errcode = 'check_violation';
  end if;

  return next_balance;
end;
$$;

revoke all on function public.portfell_apply_cash_delta(uuid, numeric)
  from anon, public;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric)
  to authenticated;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric)
  to service_role;
