/*
  A class portfolio stays in its class, proved against the policy.

  Migration 20260819120000 stopped a real portfolio being pinned into a
  classroom. The other direction was open: a student who belongs to an
  ordinary circle as well as a class could pin the class's paper portfolio
  into the circle, where every member would read homework as somebody's
  real holdings. Migration 20260902120000 closes it in both write policies,
  and this asks the database, as the `authenticated` role with a real claim,
  whether that holds.

  Run by `supabase/tests/run.sh`.
*/

\set ON_ERROR_STOP on

begin;

-- Ann is a student. Bob runs a circle Ann is in.
insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-000000000001', 'ann@example.com'),
  ('bbbb0000-0000-0000-0000-000000000002', 'bob@example.com');

insert into public.portfell_profiles (id, email, display_name) values
  ('aaaa0000-0000-0000-0000-000000000001', 'ann@example.com', 'Ann'),
  ('bbbb0000-0000-0000-0000-000000000002', 'bob@example.com', 'Bob');

-- A class, and a circle.
insert into public.portfell_communities (id, name, created_by, kind, visibility) values
  ('cccc0000-0000-0000-0000-0000000000c1', 'Economics 101',
   'bbbb0000-0000-0000-0000-000000000002', 'classroom', 'private'),
  ('cccc0000-0000-0000-0000-0000000000c2', 'Friends',
   'bbbb0000-0000-0000-0000-000000000002', 'circle', 'private');

insert into public.portfell_community_members (community_id, user_id, role) values
  ('cccc0000-0000-0000-0000-0000000000c1', 'bbbb0000-0000-0000-0000-000000000002', 'admin'),
  ('cccc0000-0000-0000-0000-0000000000c1', 'aaaa0000-0000-0000-0000-000000000001', 'member'),
  ('cccc0000-0000-0000-0000-0000000000c2', 'bbbb0000-0000-0000-0000-000000000002', 'admin'),
  ('cccc0000-0000-0000-0000-0000000000c2', 'aaaa0000-0000-0000-0000-000000000001', 'member');

-- Ann's paper portfolio for the class, and her real one.
insert into public.portfell_portfolios (id, name, slug, owner_id, classroom_community_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Ann homework', 'ann-homework',
   'aaaa0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-0000000000c1'),
  ('aaaa0000-0000-0000-0000-0000000000a2', 'Ann savings', 'ann-savings',
   'aaaa0000-0000-0000-0000-000000000001', null);

insert into public.portfell_portfolio_owners (portfolio_id, user_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-000000000001'),
  ('aaaa0000-0000-0000-0000-0000000000a2', 'aaaa0000-0000-0000-0000-000000000001');

/* From here on we are Ann, with the claim PostgREST would set. */
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000001","email":"ann@example.com"}';

-- The paper portfolio into the circle: refused.
do $$
begin
  begin
    insert into public.portfell_community_portfolios (community_id, portfolio_id)
    values ('cccc0000-0000-0000-0000-0000000000c2',
            'aaaa0000-0000-0000-0000-0000000000a1');
    raise exception 'a student pinned a class portfolio into an ordinary circle';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end
$$;

-- The paper portfolio into its own class: fine, that is what it is for.
insert into public.portfell_community_portfolios (community_id, portfolio_id)
values ('cccc0000-0000-0000-0000-0000000000c1',
        'aaaa0000-0000-0000-0000-0000000000a1');

-- Her real portfolio into the circle: fine, that is what a circle is for.
insert into public.portfell_community_portfolios (community_id, portfolio_id)
values ('cccc0000-0000-0000-0000-0000000000c2',
        'aaaa0000-0000-0000-0000-0000000000a2');

-- And the direction 20260819120000 closed still holds.
do $$
begin
  begin
    insert into public.portfell_community_portfolios (community_id, portfolio_id)
    values ('cccc0000-0000-0000-0000-0000000000c1',
            'aaaa0000-0000-0000-0000-0000000000a2');
    raise exception 'a student pinned a real portfolio into a class';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end
$$;

/* Bob, who runs the circle, cannot pin it there either. */
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000002","email":"bob@example.com"}';

do $$
begin
  begin
    insert into public.portfell_community_portfolios (community_id, portfolio_id)
    values ('cccc0000-0000-0000-0000-0000000000c2',
            'aaaa0000-0000-0000-0000-0000000000a1');
    raise exception 'a circle admin pinned a class portfolio into the circle';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end
$$;

rollback;

\echo 'class-portfolio-stays-in-class.test.sql: a class portfolio is only ever shown in its class'
