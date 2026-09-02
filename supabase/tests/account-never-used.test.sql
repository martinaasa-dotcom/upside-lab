-- portfell_account_never_used could never answer true.
--
-- The function decides whether an address that already has an account may be
-- adopted by somebody signing in with it: only when that account has nothing
-- in it, which is a person who signed in once and closed the tab. AGENTS.md
-- describes the test as "no conviction notes or watchlist", and the SQL
-- tested for the EXISTENCE of a portfell_lab_state row.
--
-- Every account has one. ensureProfileAndClaims upserts a lab-state row at
-- sign-in, before anybody has written a note, so the clause was false for
-- everyone and the whole function was false for everyone. The documented
-- path was unreachable, and the failure looked exactly like the safe answer.
--
-- These four cases are the shape of the fix: a fresh account is adoptable, a
-- lab row alone does not make it used, and anything actually written into it
-- does.

begin;

\set ON_ERROR_STOP on

-- A brand new account: a profile and the lab row sign-in creates, nothing else.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'fresh@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'noted@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'watching@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'named@example.com');

insert into public.portfell_profiles (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'fresh@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'noted@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'watching@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'named@example.com');

update public.portfell_profiles
  set display_name = 'Ada'
  where id = '44444444-4444-4444-4444-444444444444';

-- The row sign-in creates for everybody, empty. `id` is a legacy text
-- primary key that still defaults to 'book', so each row names its own.
insert into public.portfell_lab_state (id, owner_id) values
  ('lab-fresh', '11111111-1111-1111-1111-111111111111'),
  ('lab-noted', '22222222-2222-2222-2222-222222222222'),
  ('lab-watching', '33333333-3333-3333-3333-333333333333'),
  ('lab-named', '44444444-4444-4444-4444-444444444444');

update public.portfell_lab_state
  set conviction = '{"NVDA": {"level": 4}}'::jsonb
  where owner_id = '22222222-2222-2222-2222-222222222222';

update public.portfell_lab_state
  set watchlist = '["NVDA"]'::jsonb
  where owner_id = '33333333-3333-3333-3333-333333333333';

do $$
begin
  if not public.portfell_account_never_used(
    '11111111-1111-1111-1111-111111111111'
  ) then
    raise exception
      'an account with only the lab row sign-in creates was judged used, which is the bug that made the whole address-takeover path dead';
  end if;

  if public.portfell_account_never_used(
    '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'an account with a conviction note was judged never used';
  end if;

  if public.portfell_account_never_used(
    '33333333-3333-3333-3333-333333333333'
  ) then
    raise exception 'an account with a watchlist was judged never used';
  end if;

  if public.portfell_account_never_used(
    '44444444-4444-4444-4444-444444444444'
  ) then
    raise exception 'an account with a name on it was judged never used';
  end if;
end $$;

rollback;
