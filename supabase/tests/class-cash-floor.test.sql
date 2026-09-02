/*
  A class portfolio cannot spend money it has not got, proved against the
  function rather than against the route.

  A classroom paper portfolio has starting money a teacher sets, no broker
  behind it, and a league ranking students on what their portfolio is worth
  against what they began with. Nothing stopped a balance going below zero,
  so a student could buy a million dollars of anything with ten thousand and
  finish first, with every figure on every screen adding up correctly
  afterwards, because the arithmetic was never wrong. Only the premise was.

  The floor is in the function and not in Node because a check in the app is
  a read and then an act, and two overlapping buys both read the same balance
  and both pass. It is deliberately only for a portfolio with a
  classroom_community_id: on a real portfolio, cash below zero is a broker's
  loan, which this product shows on purpose.

  Run by `supabase/tests/run.sh`.
*/

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-0000000000f1', 'student@example.com');

insert into public.portfell_profiles (id, email, display_name) values
  ('aaaa0000-0000-0000-0000-0000000000f1', 'student@example.com', 'Student');

insert into public.portfell_communities (id, name, created_by, kind, visibility) values
  ('cccc0000-0000-0000-0000-0000000000f1', 'Economics 101',
   'aaaa0000-0000-0000-0000-0000000000f1', 'classroom', 'private');

-- One paper portfolio in the class, and one ordinary portfolio, both the
-- same person's and both starting with the same money.
insert into public.portfell_portfolios
  (id, name, slug, owner_id, cash_balance, classroom_community_id) values
  ('dddd0000-0000-0000-0000-0000000000f1', 'Homework', 'homework-f1',
   'aaaa0000-0000-0000-0000-0000000000f1', 10000,
   'cccc0000-0000-0000-0000-0000000000f1'),
  ('dddd0000-0000-0000-0000-0000000000f2', 'My own', 'my-own-f2',
   'aaaa0000-0000-0000-0000-0000000000f1', 10000, null);

insert into public.portfell_portfolio_owners (portfolio_id, user_id) values
  ('dddd0000-0000-0000-0000-0000000000f1', 'aaaa0000-0000-0000-0000-0000000000f1'),
  ('dddd0000-0000-0000-0000-0000000000f2', 'aaaa0000-0000-0000-0000-0000000000f1');

-- A buy the student can afford goes through, and answers with the balance.
do $$
declare
  left_over numeric;
begin
  left_over := public.portfell_apply_cash_delta(
    'dddd0000-0000-0000-0000-0000000000f1', -2500
  );
  if left_over is distinct from 7500 then
    raise exception 'a buy inside the balance should leave 7500, got %', left_over;
  end if;
end $$;

-- A buy past it is refused, and the balance is untouched afterwards: the
-- raise happens inside the same transaction as the update, so the write is
-- rolled back with it rather than left half applied.
do $$
declare
  refused boolean := false;
  still numeric;
begin
  begin
    perform public.portfell_apply_cash_delta(
      'dddd0000-0000-0000-0000-0000000000f1', -1000000
    );
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'a class portfolio was allowed to spend money it has not got';
  end if;
  select cash_balance into still
  from public.portfell_portfolios
  where id = 'dddd0000-0000-0000-0000-0000000000f1';
  if still is distinct from 7500 then
    raise exception 'the refused buy left the balance at %, expected 7500', still;
  end if;
end $$;

-- Spending exactly the balance is allowed. Zero is not below zero, and a
-- student who puts everything in should not be refused at the last dollar.
do $$
declare
  left_over numeric;
begin
  left_over := public.portfell_apply_cash_delta(
    'dddd0000-0000-0000-0000-0000000000f1', -7500
  );
  if left_over is distinct from 0 then
    raise exception 'spending the whole balance should leave 0, got %', left_over;
  end if;
end $$;

-- A real portfolio still goes below zero, because that is a broker's loan
-- and the product says so on the Cash card.
do $$
declare
  owed numeric;
begin
  owed := public.portfell_apply_cash_delta(
    'dddd0000-0000-0000-0000-0000000000f2', -17000
  );
  if owed is distinct from -7000 then
    raise exception 'an ordinary portfolio should reach -7000, got %', owed;
  end if;
end $$;

rollback;

\echo 'class-cash-floor.test.sql: a class portfolio cannot spend money it has not got'
