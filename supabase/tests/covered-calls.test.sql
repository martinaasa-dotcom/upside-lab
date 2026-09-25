/*
  A covered call is what somebody promised to sell their shares for, and
  it is the co-owners' business only: not another stranger's, and not a
  circle's either, which is the one way this table deliberately differs
  from holdings. Every check runs as the `authenticated` role with a real
  claim, the way PostgREST does, and goes at the table directly.
*/

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-000000000011', 'cara@example.com'),
  ('bbbb0000-0000-0000-0000-000000000012', 'dan@example.com');

insert into public.portfell_profiles (id, email, display_name) values
  ('aaaa0000-0000-0000-0000-000000000011', 'cara@example.com', 'Cara'),
  ('bbbb0000-0000-0000-0000-000000000012', 'dan@example.com', 'Dan');

insert into public.portfell_portfolios (id, name, slug, owner_id) values
  ('aaaa0000-0000-0000-0000-0000000000d1', 'Cara book', 'cara-book',
   'aaaa0000-0000-0000-0000-000000000011'),
  ('bbbb0000-0000-0000-0000-0000000000d2', 'Dan book', 'dan-book',
   'bbbb0000-0000-0000-0000-000000000012');

insert into public.portfell_portfolio_owners (portfolio_id, user_id) values
  ('aaaa0000-0000-0000-0000-0000000000d1', 'aaaa0000-0000-0000-0000-000000000011'),
  ('bbbb0000-0000-0000-0000-0000000000d2', 'bbbb0000-0000-0000-0000-000000000012');

insert into public.portfell_covered_calls
  (portfolio_id, ticker, status, strike, expiry, contracts, premium) values
  ('aaaa0000-0000-0000-0000-0000000000d1', 'NVDA', 'sold', 200, '2026-10-16', 1, 3.2),
  ('bbbb0000-0000-0000-0000-0000000000d2', 'AAPL', 'planned', 260, '2026-10-16', 2, null);

-- A sold call must carry what it was sold for.
do $$
begin
  begin
    insert into public.portfell_covered_calls
      (portfolio_id, ticker, status, strike, expiry, contracts)
    values ('aaaa0000-0000-0000-0000-0000000000d1', 'NVDA', 'sold', 210, '2026-10-16', 1);
    raise exception 'a sold call with no premium was stored';
  exception when check_violation then
    null;
  end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000011","email":"cara@example.com"}';

do $$
declare n integer;
begin
  select count(*) into n from public.portfell_covered_calls;
  if n <> 1 then
    raise exception 'Cara sees % covered calls, expected only her own', n;
  end if;

  update public.portfell_covered_calls set strike = 1
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000d2';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Cara changed Dan''s covered call';
  end if;

  delete from public.portfell_covered_calls
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000d2';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Cara removed Dan''s covered call';
  end if;

  begin
    insert into public.portfell_covered_calls
      (portfolio_id, ticker, status, strike, expiry, contracts, premium)
    values ('bbbb0000-0000-0000-0000-0000000000d2', 'AAPL', 'sold', 1, '2026-10-16', 1, 1);
    raise exception 'Cara wrote a covered call into Dan''s portfolio';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
