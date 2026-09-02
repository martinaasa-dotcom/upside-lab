/*
  Account deletion, proved complete rather than assumed.

  The GDPR export is paged and tested for completeness; deletion had no
  equivalent, and its failure mode is the quiet kind: a table added later
  with a user-keyed row that nothing in the deletion path names fails
  silently as an orphaned row at best and as a compliance gap at worst.
  This file is `complete-reads.test.ts` for deletion, asked of the database
  itself instead of the source text.

  Three parts:

  1. Catalog: every foreign key on a portfell_* table is CASCADE or
     SET NULL. A NO ACTION key either blocks the profile delete outright
     or strands rows, and neither is ever the intent here.

  2. Catalog: every user- or email-identity column that has no foreign key
     to die by must be named in one of the deletion-path functions, or
     stand in the short allowlist below with its reason written beside it.
     The allowlist self-checks: an entry whose column has since gained
     coverage, or no longer exists, fails as stale.

  3. Behaviour: seed a person with rows in the real tables, delete them
     through both doors (the self-service RPC, and the dashboard-style
     auth.users delete), and sweep every identity column in the schema for
     anything still keyed to them.

  Known limit, on purpose: rule 1 and the sweep reason about columns, so a
  jsonb payload that embeds personal data (the book snapshots) is beyond
  them. That one is covered by behaviour in part 3, and a new
  payload-shaped table needs the same hand-written care.
*/

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- 1. No portfell foreign key may refuse a delete.
-- ---------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  select string_agg(
    format('%s.%s -> %s (%s)', tc.table_name, kcu.column_name,
           ccu.table_name, rc.delete_rule), ', ')
  into bad
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.constraint_schema = tc.constraint_schema
  join information_schema.referential_constraints rc
    on rc.constraint_name = tc.constraint_name
   and rc.constraint_schema = tc.constraint_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
   and ccu.constraint_schema = tc.constraint_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and tc.table_name like 'portfell%'
    and rc.delete_rule not in ('CASCADE', 'SET NULL');

  if bad is not null then
    raise exception
      'foreign keys that would block or strand a deletion: %. Decide what '
      'the rows mean once their person is gone and say so with CASCADE or '
      'SET NULL.', bad;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Every identity column without a key to die by is purged, or excused.
-- ---------------------------------------------------------------------------
do $$
declare
  /*
    Uncovered identity columns this test accepts, with the reason:

    - portfell_community_invites.email, portfell_portfolio_invites.email:
      an invite is the SENDER's record, their outbox, usually written
      before the address had an account at all. The GDPR export takes the
      same view (it exports invites keyed by your portfolios, not ones
      addressed to you), and a deleted person who is re-invited can join
      again. Purging them would delete part of somebody else's data.
  */
  allow constant text[] := array[
    'portfell_community_invites.email',
    'portfell_portfolio_invites.email'
  ];
  purge_src text;
  rec record;
  key text;
  covered boolean;
  seen_allow text[] := '{}';
  missing text := '';
  entry text;
begin
  select string_agg(pg_get_functiondef(p.oid), E'\n') into purge_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'portfell_purge_user_data',
      'portfell_delete_my_account',
      'portfell_before_delete_profile_addresses',
      'portfell_before_delete_account_email'
    );

  for rec in
    select c.oid as reloid, c.relname as tbl, a.attname as col
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'portfell%'
      and a.attnum > 0
      and not a.attisdropped
      and a.attname ~ '(user_id|owner_id|profile_id|created_by|decided_by|invited_by|email)$'
      and not exists (
        select 1 from pg_constraint fk
        where fk.conrelid = c.oid
          and fk.contype = 'f'
          and a.attnum = any (fk.conkey)
      )
    order by c.relname, a.attname
  loop
    key := rec.tbl || '.' || rec.col;

    if key = any (allow) then
      seen_allow := array_append(seen_allow, key);
      continue;
    end if;

    -- Covered if any CASCADE key to the profile or the auth user takes the
    -- whole row with it. (Sound while the identity a row carries is the
    -- identity its key points at, which is true of every table here today;
    -- a table keyed to one person but naming another needs its own line in
    -- the purge and would land in `missing` the moment the key differs.)
    select exists (
      select 1 from pg_constraint fk
      where fk.conrelid = rec.reloid
        and fk.contype = 'f'
        and fk.confdeltype = 'c'
        and fk.confrelid in (
          'public.portfell_profiles'::regclass, 'auth.users'::regclass
        )
    ) into covered;

    -- Or the deletion path deletes from the table by name.
    if not covered then
      covered := purge_src ~*
        ('delete\s+from\s+(public\.)?' || rec.tbl || '\M');
    end if;

    if not covered then
      missing := missing || case when missing = '' then '' else ', ' end || key;
    end if;
  end loop;

  if missing <> '' then
    raise exception
      'identity columns nothing deletes: %. Either the deletion path '
      '(portfell_purge_user_data or the profile-delete triggers) must '
      'delete from these tables, or the column belongs in this test''s '
      'allowlist with its reason written down.', missing;
  end if;

  foreach entry in array allow loop
    if not (entry = any (seen_allow)) then
      raise exception
        'stale allowlist entry: % is covered now (or gone). Remove it so '
        'the list cannot become a parking space.', entry;
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Behaviour: two people, two doors out, nothing left behind.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('cccc0000-0000-0000-0000-000000000001', 'carol@example.com'),
  ('dddd0000-0000-0000-0000-000000000002', 'dave@example.com'),
  ('eeee0000-0000-0000-0000-000000000003', 'erin@example.com');

insert into public.portfell_profiles (id, email, display_name) values
  ('cccc0000-0000-0000-0000-000000000001', 'carol@example.com', 'Carol'),
  ('dddd0000-0000-0000-0000-000000000002', 'dave@example.com', 'Dave'),
  ('eeee0000-0000-0000-0000-000000000003', 'erin@example.com', 'Erin');

-- Carol: a sole-owned portfolio with a holding and a cash event, a share in
-- Dave's portfolio, conviction notes, a circle of her own, a linked second
-- address, pending sign-in links on both addresses, an alias, a seed claim,
-- a household row, error-log PII, and a nightly snapshot naming her book.
insert into public.portfell_portfolios (id, name, slug, owner_id) values
  ('cccc0000-0000-0000-0000-0000000000a1', 'Carol book', 'carol-book',
   'cccc0000-0000-0000-0000-000000000001'),
  ('dddd0000-0000-0000-0000-0000000000b1', 'Dave book', 'dave-book',
   'dddd0000-0000-0000-0000-000000000002');

insert into public.portfell_portfolio_owners (portfolio_id, user_id) values
  ('cccc0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-000000000001'),
  ('dddd0000-0000-0000-0000-0000000000b1', 'dddd0000-0000-0000-0000-000000000002'),
  ('dddd0000-0000-0000-0000-0000000000b1', 'cccc0000-0000-0000-0000-000000000001');

insert into public.portfell_holdings (portfolio_id, ticker, shares, buy_price)
values ('cccc0000-0000-0000-0000-0000000000a1', 'NVDA', 10, 100);

insert into public.portfell_cash_events
  (portfolio_id, user_id, delta, balance_after)
values
  ('cccc0000-0000-0000-0000-0000000000a1',
   'cccc0000-0000-0000-0000-000000000001', 100, 100),
  ('dddd0000-0000-0000-0000-0000000000b1',
   'cccc0000-0000-0000-0000-000000000001', 50, 50);

insert into public.portfell_lab_state (id, owner_id, conviction) values
  ('cccc0000-0000-0000-0000-0000000000c1',
   'cccc0000-0000-0000-0000-000000000001', '{"NVDA":{"thesis":"note"}}');

insert into public.portfell_communities (id, name, created_by) values
  ('cccc0000-0000-0000-0000-0000000000d1', 'Carol circle',
   'cccc0000-0000-0000-0000-000000000001');
insert into public.portfell_community_members (community_id, user_id, role)
values ('cccc0000-0000-0000-0000-0000000000d1',
        'cccc0000-0000-0000-0000-000000000001', 'admin');

insert into public.portfell_account_emails (user_id, email, verified_at)
values ('cccc0000-0000-0000-0000-000000000001', 'carol@work.example',
        now());

insert into public.portfell_email_logins (email, token_hash, expires_at)
values
  ('carol@example.com', 'hash-carol-primary', now() + interval '1 hour'),
  ('carol@work.example', 'hash-carol-work', now() + interval '1 hour'),
  ('stranger@example.com', 'hash-stranger', now() + interval '1 hour');

insert into public.portfell_account_aliases (alias_email, primary_email)
values ('carol@work.example', 'carol@example.com');

insert into public.portfell_seed_claims (email, portfolio_slug)
values ('carol@example.com', 'carol-book');

insert into public.portfell_household_groups (email, group_key)
values ('carol@example.com', 'test-household');

insert into public.portfell_error_log (source, message, user_id, user_email)
values ('server', 'boom', 'cccc0000-0000-0000-0000-000000000001',
        'carol@example.com');

-- The saved copies carry whole portfolio rows, so each entry names the
-- owner it had when the copy was taken. Carol created the shared book, so
-- her id is on it: the scrub has to leave that one alone, because Dave is
-- still in it and it still exists.
insert into public.portfell_book_snapshots (kind, label, payload) values
  ('nightly', 'Nightly test', jsonb_build_object(
    'portfolios', jsonb_build_array(
      jsonb_build_object(
        'id', 'cccc0000-0000-0000-0000-0000000000a1',
        'owner_id', 'cccc0000-0000-0000-0000-000000000001'),
      jsonb_build_object(
        'id', 'dddd0000-0000-0000-0000-0000000000b1',
        'owner_id', 'cccc0000-0000-0000-0000-000000000001')
    ),
    'holdings', jsonb_build_array(
      jsonb_build_object(
        'portfolio_id', 'cccc0000-0000-0000-0000-0000000000a1',
        'ticker', 'NVDA')
    )
  ));

/*
  A portfolio Carol deleted months before she deleted her account. The
  portfolio row is long gone, so nothing in portfell_portfolio_owners names
  it any more, and the copy DELETE /api/portfolios took on the way out is
  the only place her holdings in it still exist. Deleting her account has to
  reach it.
*/
insert into public.portfell_book_snapshots (kind, label, payload) values
  ('pre_delete', 'Before delete: Carol old book', jsonb_build_object(
    'portfolios', jsonb_build_array(
      jsonb_build_object(
        'id', 'cccc0000-0000-0000-0000-0000000000f1',
        'name', 'Carol old book',
        'owner_id', 'cccc0000-0000-0000-0000-000000000001')
    ),
    'holdings', jsonb_build_array(
      jsonb_build_object(
        'portfolio_id', 'cccc0000-0000-0000-0000-0000000000f1',
        'ticker', 'CRWV')
    ),
    'marks', jsonb_build_object(
      'navByPortfolio',
      jsonb_build_object('cccc0000-0000-0000-0000-0000000000f1', 1000)
    )
  ));

-- Invites addressed to Carol, written by Dave. These are the allowlisted
-- rows: the sender's record, asserted below to survive on purpose.
insert into public.portfell_portfolio_invites
  (portfolio_id, token_hash, email, created_by)
values ('dddd0000-0000-0000-0000-0000000000b1', 'invite-hash-1',
        'carol@example.com', 'dddd0000-0000-0000-0000-000000000002');

-- Erin: the lighter seed for the second door (a dashboard-style
-- auth.users delete, which must purge exactly as thoroughly).
insert into public.portfell_portfolios (id, name, slug, owner_id) values
  ('eeee0000-0000-0000-0000-0000000000e1', 'Erin book', 'erin-book',
   'eeee0000-0000-0000-0000-000000000003');
insert into public.portfell_portfolio_owners (portfolio_id, user_id)
values ('eeee0000-0000-0000-0000-0000000000e1',
        'eeee0000-0000-0000-0000-000000000003');
insert into public.portfell_account_emails (user_id, email)
values ('eeee0000-0000-0000-0000-000000000003', 'erin@work.example');
insert into public.portfell_email_logins (email, token_hash, expires_at)
values ('erin@work.example', 'hash-erin-work', now() + interval '1 hour');

/* Carol deletes her own account, exactly as the API route does. */
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cccc0000-0000-0000-0000-000000000001","email":"carol@example.com"}';
select public.portfell_delete_my_account();
reset role;

/* The dashboard door: the auth user is deleted directly. */
delete from auth.users where id = 'eeee0000-0000-0000-0000-000000000003';

do $$
declare
  carol constant uuid := 'cccc0000-0000-0000-0000-000000000001';
  erin constant uuid := 'eeee0000-0000-0000-0000-000000000003';
  addrs constant text[] := array[
    'carol@example.com', 'carol@work.example',
    'erin@example.com', 'erin@work.example'
  ];
  allow constant text[] := array[
    'portfell_community_invites.email',
    'portfell_portfolio_invites.email'
  ];
  rec record;
  n integer;
begin
  /*
    Sweep every identity column in the schema, keyed and keyless alike,
    for anything still holding either deleted person. Dynamic on purpose:
    a table added next year with a user_id is swept here without anyone
    editing this file, provided part 2 already made its deletion story
    explicit.
  */
  for rec in
    select c.relname as tbl, a.attname as col,
           format_type(a.atttypid, null) as typ
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'portfell%'
      and a.attnum > 0
      and not a.attisdropped
      and a.attname ~ '(user_id|owner_id|profile_id|created_by|decided_by|invited_by|email)$'
    order by c.relname, a.attname
  loop
    if (rec.tbl || '.' || rec.col) = any (allow) then
      continue;
    end if;
    if rec.typ = 'uuid' then
      execute format(
        'select count(*) from public.%I where %I in ($1, $2)',
        rec.tbl, rec.col
      ) into n using carol, erin;
    else
      execute format(
        'select count(*) from public.%I where lower(%I) = any ($1)',
        rec.tbl, rec.col
      ) into n using addrs;
    end if;
    if n > 0 then
      raise exception
        'deletion left % row(s) in %.% still keyed to a deleted person',
        n, rec.tbl, rec.col;
    end if;
  end loop;

  -- The profile rows themselves.
  select count(*) into n from public.portfell_profiles
  where id in (carol, erin);
  if n <> 0 then
    raise exception 'a deleted person still has a profile row';
  end if;

  -- Sole-owned books go, with their holdings; the shared book stays whole
  -- for the person still in it.
  select count(*) into n from public.portfell_portfolios
  where id in ('cccc0000-0000-0000-0000-0000000000a1',
               'eeee0000-0000-0000-0000-0000000000e1');
  if n <> 0 then
    raise exception 'a sole-owned portfolio survived its owner''s deletion';
  end if;
  select count(*) into n from public.portfell_portfolios
  where id = 'dddd0000-0000-0000-0000-0000000000b1';
  if n <> 1 then
    raise exception 'deleting a co-owner deleted the shared portfolio';
  end if;

  -- The shared book's cash history survives anonymized: the row belongs to
  -- the portfolio, the actor column goes null, which is the SET NULL
  -- design being exercised rather than assumed.
  select count(*) into n from public.portfell_cash_events
  where portfolio_id = 'dddd0000-0000-0000-0000-0000000000b1'
    and user_id is null;
  if n <> 1 then
    raise exception
      'the shared portfolio''s cash event should survive with a null actor';
  end if;

  -- Snapshots are scrubbed of the deleted book and keep the shared one.
  select count(*) into n from public.portfell_book_snapshots
  where payload::text like '%cccc0000-0000-0000-0000-0000000000a1%';
  if n <> 0 then
    raise exception 'a snapshot still names the deleted portfolio';
  end if;
  select count(*) into n from public.portfell_book_snapshots
  where payload::text like '%dddd0000-0000-0000-0000-0000000000b1%';
  if n <> 1 then
    raise exception 'snapshot scrubbing took the shared portfolio too';
  end if;

  -- And the copy of the portfolio she deleted long before her account, which
  -- no owners row pointed at any more. Its holdings and its mark go with it,
  -- and so does the row itself, whose label is the name she gave it.
  select count(*) into n from public.portfell_book_snapshots
  where payload::text like '%cccc0000-0000-0000-0000-0000000000f1%'
     or label like '%Carol old book%';
  if n <> 0 then
    raise exception
      'a saved copy still holds a portfolio the deleted person had already '
      'deleted; the purge only reached the ones she still owned';
  end if;

  -- A stranger's pending sign-in link is not ours to delete.
  select count(*) into n from public.portfell_email_logins
  where email = 'stranger@example.com';
  if n <> 1 then
    raise exception
      'deletion removed a pending sign-in link belonging to someone else';
  end if;

  -- The allowlisted survivors, pinned so a future change is a decision:
  -- Dave's invite to Carol is Dave's record and stays.
  select count(*) into n from public.portfell_portfolio_invites
  where email = 'carol@example.com';
  if n <> 1 then
    raise exception
      'the sender''s invite record went with the recipient''s account; if '
      'that became deliberate, move the column out of the allowlist';
  end if;
end
$$;

rollback;

\echo 'account-deletion.test.sql: nothing keyed to a deleted person survives'
