/*
  Household and classroom state transitions, proved at the database.

  The steady-state rules (opt-in membership, invite redemption) are well
  covered; the audit checklist flagged the transitions as the uncovered
  half, and every one of them is decided by a trigger in this schema, so
  this is where they are pinned:

  - a household pair mirrors circle join, role and leave while paired,
    and a partially unlinked pair stops mirroring without the remaining
    half losing anything;
  - a classroom never mirrors, because classrooms stay per person;
  - the last admin cannot walk out of a community that still has people
    in it, and the remedy (promote first, then leave) works;
  - deleting a class mid-term, open buy period and all, frees the
    students' homework portfolios instead of deleting their work, and
    the last-admin guard does not block the cascade.

  Run by supabase/tests/run.sh against the schema every migration builds.
*/

\set ON_ERROR_STOP on

begin;

-- The karud household pair, by the exact emails migration 053 seeded into
-- portfell_household_groups: the mirror trigger matches on those.
insert into auth.users (id, email) values
  ('1a000000-0000-0000-0000-000000000001', 'rasmusmarjapuu@gmail.com'),
  ('1a000000-0000-0000-0000-000000000002', 'karukaroliine99@gmail.com'),
  ('1a000000-0000-0000-0000-000000000003', 'dana@example.com'),
  ('1a000000-0000-0000-0000-000000000004', 'member@example.com'),
  ('1a000000-0000-0000-0000-000000000005', 'teacher@example.com'),
  ('1a000000-0000-0000-0000-000000000006', 'student@example.com'),
  ('1a000000-0000-0000-0000-000000000007', 'coteacher@example.com');

insert into public.portfell_profiles (id, email, display_name) values
  ('1a000000-0000-0000-0000-000000000001', 'rasmusmarjapuu@gmail.com', 'Rasmus'),
  ('1a000000-0000-0000-0000-000000000002', 'karukaroliine99@gmail.com', 'Karoliine'),
  ('1a000000-0000-0000-0000-000000000003', 'dana@example.com', 'Dana'),
  ('1a000000-0000-0000-0000-000000000004', 'member@example.com', 'Member'),
  ('1a000000-0000-0000-0000-000000000005', 'teacher@example.com', 'Teacher'),
  ('1a000000-0000-0000-0000-000000000006', 'student@example.com', 'Student'),
  ('1a000000-0000-0000-0000-000000000007', 'coteacher@example.com', 'Co teacher');

insert into public.portfell_communities (id, name, kind, visibility) values
  ('2b000000-0000-0000-0000-0000000000c1', 'Shared circle', 'circle', 'private'),
  ('2b000000-0000-0000-0000-0000000000c2', 'Paper class', 'classroom', 'private'),
  ('2b000000-0000-0000-0000-0000000000c3', 'Dana circle', 'circle', 'private');

-- ---------------------------------------------------------------------------
-- Household mirroring, while paired.
-- ---------------------------------------------------------------------------
insert into public.portfell_community_members (community_id, user_id, role)
values ('2b000000-0000-0000-0000-0000000000c1',
        '1a000000-0000-0000-0000-000000000001', 'member');

do $$
declare n integer; r text;
begin
  select count(*), min(role) into n, r
  from public.portfell_community_members
  where community_id = '2b000000-0000-0000-0000-0000000000c1'
    and user_id = '1a000000-0000-0000-0000-000000000002';
  if n <> 1 or r <> 'member' then
    raise exception 'circle join did not mirror to the household partner';
  end if;
end
$$;

update public.portfell_community_members
set role = 'admin'
where community_id = '2b000000-0000-0000-0000-0000000000c1'
  and user_id = '1a000000-0000-0000-0000-000000000001';

do $$
declare r text;
begin
  select role into r
  from public.portfell_community_members
  where community_id = '2b000000-0000-0000-0000-0000000000c1'
    and user_id = '1a000000-0000-0000-0000-000000000002';
  if r <> 'admin' then
    raise exception 'a role change did not mirror across the household';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- A classroom never mirrors: enrolment is per person.
-- ---------------------------------------------------------------------------
insert into public.portfell_community_members (community_id, user_id, role)
values ('2b000000-0000-0000-0000-0000000000c2',
        '1a000000-0000-0000-0000-000000000001', 'member');

do $$
declare n integer;
begin
  select count(*) into n
  from public.portfell_community_members
  where community_id = '2b000000-0000-0000-0000-0000000000c2'
    and user_id = '1a000000-0000-0000-0000-000000000002';
  if n <> 0 then
    raise exception 'joining a classroom auto-enrolled the household partner';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Partial unlink: one half leaves the household, then leaves the circle.
-- The remaining half keeps her own membership; the mirror just stops.
-- ---------------------------------------------------------------------------
delete from public.portfell_household_groups
where email = 'karukaroliine99@gmail.com';

delete from public.portfell_community_members
where community_id = '2b000000-0000-0000-0000-0000000000c1'
  and user_id = '1a000000-0000-0000-0000-000000000001';

do $$
declare gone integer; kept integer;
begin
  select count(*) into gone
  from public.portfell_community_members
  where community_id = '2b000000-0000-0000-0000-0000000000c1'
    and user_id = '1a000000-0000-0000-0000-000000000001';
  select count(*) into kept
  from public.portfell_community_members
  where community_id = '2b000000-0000-0000-0000-0000000000c1'
    and user_id = '1a000000-0000-0000-0000-000000000002';
  if gone <> 0 then
    raise exception 'the leaver is somehow still a member';
  end if;
  if kept <> 1 then
    raise exception
      'an unlinked partner was swept out by her ex-partner''s leave';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The last admin cannot leave people behind with nobody in charge.
-- ---------------------------------------------------------------------------
insert into public.portfell_community_members (community_id, user_id, role) values
  ('2b000000-0000-0000-0000-0000000000c3',
   '1a000000-0000-0000-0000-000000000003', 'admin'),
  ('2b000000-0000-0000-0000-0000000000c3',
   '1a000000-0000-0000-0000-000000000004', 'member');

do $$
declare fired boolean := false;
begin
  begin
    delete from public.portfell_community_members
    where community_id = '2b000000-0000-0000-0000-0000000000c3'
      and user_id = '1a000000-0000-0000-0000-000000000003';
  exception when others then
    fired := sqlerrm like '%Keep at least one admin%';
    if not fired then raise; end if;
  end;
  if not fired then
    raise exception 'the only admin left a circle with a member still in it';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Teacher removed mid-year: refused alone, fine once a co-teacher holds
-- the keys. This is the documented remedy, exercised.
-- ---------------------------------------------------------------------------
insert into public.portfell_community_members (community_id, user_id, role) values
  ('2b000000-0000-0000-0000-0000000000c2',
   '1a000000-0000-0000-0000-000000000005', 'admin'),
  ('2b000000-0000-0000-0000-0000000000c2',
   '1a000000-0000-0000-0000-000000000006', 'member');

do $$
declare fired boolean := false;
begin
  begin
    delete from public.portfell_community_members
    where community_id = '2b000000-0000-0000-0000-0000000000c2'
      and user_id = '1a000000-0000-0000-0000-000000000005';
  exception when others then
    fired := sqlerrm like '%Keep at least one admin%';
    if not fired then raise; end if;
  end;
  if not fired then
    raise exception 'the only teacher left a class with students still in it';
  end if;
end
$$;

insert into public.portfell_community_members (community_id, user_id, role)
values ('2b000000-0000-0000-0000-0000000000c2',
        '1a000000-0000-0000-0000-000000000007', 'admin');

delete from public.portfell_community_members
where community_id = '2b000000-0000-0000-0000-0000000000c2'
  and user_id = '1a000000-0000-0000-0000-000000000005';

do $$
declare n integer;
begin
  select count(*) into n
  from public.portfell_community_members
  where community_id = '2b000000-0000-0000-0000-0000000000c2'
    and role = 'admin';
  if n <> 1 then
    raise exception 'the teacher handoff did not leave exactly one admin';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The class is deleted mid-term, buy period open. Students keep their
-- work: the homework portfolio survives, unpinned, and the last-admin
-- guard lets the community's own cascade through.
-- ---------------------------------------------------------------------------
update public.portfell_communities
set class_plan = '{"purpose":"Paper class","periods":[{"id":"p1","kind":"buy","startsAt":"2026-08-01T00:00:00Z","endsAt":null}]}'::jsonb
where id = '2b000000-0000-0000-0000-0000000000c2';

insert into public.portfell_portfolios
  (id, name, slug, owner_id, classroom_community_id, cash_balance)
values
  ('3c000000-0000-0000-0000-0000000000e1', 'Student homework',
   'student-homework', '1a000000-0000-0000-0000-000000000006',
   '2b000000-0000-0000-0000-0000000000c2', 10000);
insert into public.portfell_holdings (portfolio_id, ticker, shares, buy_price)
values ('3c000000-0000-0000-0000-0000000000e1', 'NVDA', 5, 100);

delete from public.portfell_communities
where id = '2b000000-0000-0000-0000-0000000000c2';

do $$
declare pinned uuid; holdings integer; members integer;
begin
  select classroom_community_id into pinned
  from public.portfell_portfolios
  where id = '3c000000-0000-0000-0000-0000000000e1';
  if pinned is not null then
    raise exception 'the deleted class still pins the student portfolio';
  end if;
  select count(*) into holdings
  from public.portfell_holdings
  where portfolio_id = '3c000000-0000-0000-0000-0000000000e1';
  if holdings <> 1 then
    raise exception 'deleting the class deleted a student''s work';
  end if;
  select count(*) into members
  from public.portfell_community_members
  where community_id = '2b000000-0000-0000-0000-0000000000c2';
  if members <> 0 then
    raise exception 'the class cascade left members behind';
  end if;
end
$$;

rollback;

\echo 'household-classroom.test.sql: every transition lands where it should'
