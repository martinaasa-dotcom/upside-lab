/*
  Row level security, proved rather than reasoned about.

  The audit's section 15.3 asks for the one thing a reading of the policies
  cannot settle: that a signed-in person "genuinely cannot query another
  user's data even with a crafted request, not just that the UI hides it".
  Every check here runs as the `authenticated` role with a real claim set,
  which is exactly what PostgREST does with a user's token, and goes at the
  tables directly. Nothing in this file goes through the app.

  The service role is deliberately not used: it bypasses row level security
  by design, so a test that used it would pass whatever the policies said.
  Setup writes happen as the owner, before the role is dropped.

  Run by `supabase/tests/run.sh`, which builds the database from
  `shim.sql` plus every migration first.
*/

\set ON_ERROR_STOP on

begin;

-- Two people who have never met.
insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-000000000001', 'ann@example.com'),
  ('bbbb0000-0000-0000-0000-000000000002', 'bob@example.com');

insert into public.portfell_profiles (id, email, display_name) values
  ('aaaa0000-0000-0000-0000-000000000001', 'ann@example.com', 'Ann'),
  ('bbbb0000-0000-0000-0000-000000000002', 'bob@example.com', 'Bob');

insert into public.portfell_portfolios (id, name, slug, owner_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Ann book', 'ann-book',
   'aaaa0000-0000-0000-0000-000000000001'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Bob book', 'bob-book',
   'bbbb0000-0000-0000-0000-000000000002');

insert into public.portfell_portfolio_owners (portfolio_id, user_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-000000000001'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'bbbb0000-0000-0000-0000-000000000002');

insert into public.portfell_holdings (portfolio_id, ticker, shares, buy_price) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'NVDA', 100, 500),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'AAPL', 50, 200);

insert into public.portfell_lab_state (id, owner_id, conviction) values
  ('aaaa0000-0000-0000-0000-0000000000c1',
   'aaaa0000-0000-0000-0000-000000000001', '{"NVDA":{"thesis":"Ann''s note"}}'),
  ('bbbb0000-0000-0000-0000-0000000000c2',
   'bbbb0000-0000-0000-0000-000000000002', '{"AAPL":{"thesis":"Bob''s note"}}');

/* From here on we are Ann, with the claim PostgREST would set. */
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000001","email":"ann@example.com"}';

do $$
declare n integer;
begin
  -- Her own portfolio, and only hers.
  select count(*) into n from public.portfell_portfolios;
  if n <> 1 then
    raise exception 'Ann sees % portfolios, expected only her own', n;
  end if;

  select count(*) into n from public.portfell_portfolios
  where id = 'bbbb0000-0000-0000-0000-0000000000b1';
  if n <> 0 then
    raise exception 'Ann can read Bob''s portfolio by asking for it directly';
  end if;

  -- Holdings are the cost basis. Naming the row must not produce it.
  select count(*) into n from public.portfell_holdings;
  if n <> 1 then
    raise exception 'Ann sees % holdings, expected only her own', n;
  end if;

  select count(*) into n from public.portfell_holdings
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000b1';
  if n <> 0 then
    raise exception 'Ann can read Bob''s holdings by naming his portfolio';
  end if;

  -- Conviction notes are the most personal thing in the app.
  select count(*) into n from public.portfell_lab_state
  where owner_id = 'bbbb0000-0000-0000-0000-000000000002';
  if n <> 0 then
    raise exception 'Ann can read Bob''s conviction notes';
  end if;

  -- The join table itself, which is what decides all of the above.
  select count(*) into n from public.portfell_portfolio_owners
  where user_id = 'bbbb0000-0000-0000-0000-000000000002';
  if n <> 0 then
    raise exception 'Ann can read who co-owns what through the owners table';
  end if;
end
$$;

/* Writing is the half that costs money if it is wrong. */
do $$
declare n integer;
begin
  -- Editing somebody else's position.
  update public.portfell_holdings set shares = 1
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Ann changed % of Bob''s holdings', n;
  end if;

  -- Deleting one.
  delete from public.portfell_holdings
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Ann deleted % of Bob''s holdings', n;
  end if;

  -- Renaming his portfolio.
  update public.portfell_portfolios set name = 'mine now'
  where id = 'bbbb0000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Ann renamed Bob''s portfolio';
  end if;
end
$$;

/*
  The one that would be worst: writing herself into the owners table. That is
  a single insert away from every check above passing for the wrong person.
*/
do $$
begin
  begin
    insert into public.portfell_portfolio_owners (portfolio_id, user_id)
    values ('bbbb0000-0000-0000-0000-0000000000b1',
            'aaaa0000-0000-0000-0000-000000000001');
    raise exception 'Ann made herself a co-owner of Bob''s portfolio';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end
$$;

/* And planting a holding in his portfolio, which spends his cash. */
do $$
begin
  begin
    insert into public.portfell_holdings (portfolio_id, ticker, shares, buy_price)
    values ('bbbb0000-0000-0000-0000-0000000000b1', 'GME', 1, 1);
    raise exception 'Ann added a holding to Bob''s portfolio';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end
$$;

/* Signed out is not a way in either. */
set local role anon;
set local request.jwt.claims = '';

/*
  Two acceptable answers here, and the app gives the stronger one. Row level
  security filtering an anonymous read to nothing would be enough; the
  migrations went further and revoked `anon`'s grant on these tables
  outright, so the read is refused before any policy is consulted. Both pass,
  because either one means a signed-out request comes away with nothing, and
  asserting only the weaker one would fail the day somebody tightened it.
*/
do $$
declare n integer;
begin
  begin
    select count(*) into n from public.portfell_portfolios;
    if n <> 0 then
      raise exception 'a signed-out request read % portfolios', n;
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    select count(*) into n from public.portfell_holdings;
    if n <> 0 then
      raise exception 'a signed-out request read % holdings', n;
    end if;
  exception
    when insufficient_privilege then null;
  end;
end
$$;

/*
  Ann is invited onto Bob's portfolio, which is the whole point of co-ownership,
  and that must not hand her the power to throw him off it.

  Migration 017 closed this on INSERT and left DELETE saying "any co-owner may
  delete any row for this portfolio", so an invited partner could delete the
  owner's row and be left the sole owner of somebody else's portfolio. Found
  with two real accounts against a real database, which is the only way it
  shows up: the app has no interface for it and never deletes this table.
*/
reset role;
insert into public.portfell_portfolio_owners (portfolio_id, user_id) values
  ('bbbb0000-0000-0000-0000-0000000000b1', 'aaaa0000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000001","email":"ann@example.com"}';

do $$
declare n integer;
begin
  delete from public.portfell_portfolio_owners
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000b1'
    and user_id = 'bbbb0000-0000-0000-0000-000000000002';

  select count(*) into n from public.portfell_portfolio_owners
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000b1'
    and user_id = 'bbbb0000-0000-0000-0000-000000000002';
  if n <> 1 then
    raise exception 'a co-owner removed the owner from his own portfolio';
  end if;

  -- And she may still let herself out, which is the one write she does have.
  delete from public.portfell_portfolio_owners
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000b1'
    and user_id = 'aaaa0000-0000-0000-0000-000000000001';

  select count(*) into n from public.portfell_portfolio_owners
  where portfolio_id = 'bbbb0000-0000-0000-0000-0000000000b1'
    and user_id = 'aaaa0000-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'a co-owner could not give up her own access';
  end if;
end
$$;

rollback;

\echo 'rls.test.sql: nobody reached anybody else''s book'
