/*
  One account, however many mailboxes.

  A person has one Upside Lab account, one set of portfolios and one place in
  every circle they joined. They often have more than one mailbox: the work
  address they signed up with on a laptop, and the Google account their phone
  is already signed in to. Sign-in here is Google, and Google hands back an
  address, so the second mailbox has until now meant a second account: new
  portfolios, no holdings, no circle, and a support email as the only way out.

  This is the list of the other addresses that reach one account. Supabase
  still holds exactly one auth user with one primary email. These rows are
  checked before a Google identity is turned into a session, and the session
  that comes out is the account's own. No auth user is duplicated and nothing
  else in the app learns a new key.

  Not the same thing as portfell_account_aliases, which stays. That table maps
  one address to another so that two separate accounts read as one person on a
  member list. It is a display rule, and it was the best that could be done
  without touching sign-in. This one means there is only ever one account to
  begin with, which is the part the alias table could never fix: the second
  account still had its own empty portfolios and its own seat in a circle.
*/

create table if not exists public.portfell_account_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Stored lowercase, because a mailbox is not case sensitive in any system
  -- anybody uses and two spellings of one address must not be two rows.
  email text not null,

  /*
    A pending address holds the sha256 of the token that was mailed to it,
    never the token. Somebody holding a copy of this table still cannot claim
    an address with it, which is the whole reason to hash something we could
    just as easily have kept in the clear.
  */
  token_hash text,
  token_expires_at timestamptz,

  -- Null until the person proved they can read that mailbox.
  verified_at timestamptz,

  created_at timestamptz not null default now(),

  constraint portfell_account_emails_lowercase check (email = lower(email)),
  constraint portfell_account_emails_shape check (position('@' in email) > 1)
);

/*
  One address reaches one account. This is the constraint the whole feature
  rests on: without it a second account could claim an address that already
  signs somebody else in.
*/
create unique index if not exists portfell_account_emails_email_idx
  on public.portfell_account_emails (email);

create index if not exists portfell_account_emails_user_idx
  on public.portfell_account_emails (user_id);

-- A pending token is looked up by its hash, and two rows must never share one.
create unique index if not exists portfell_account_emails_token_idx
  on public.portfell_account_emails (token_hash)
  where token_hash is not null;

alter table public.portfell_account_emails enable row level security;

drop policy if exists portfell_account_emails_select
  on public.portfell_account_emails;

-- A person reads the addresses on their own account and nobody else's.
create policy portfell_account_emails_select
  on public.portfell_account_emails for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists portfell_account_emails_delete
  on public.portfell_account_emails;

/*
  And takes one off. Deleting is the only write a client may make: adding one
  is the server's, because adding is what has to check what the address
  already reaches, and a check a client runs on its own behalf is not a check.
*/
create policy portfell_account_emails_delete
  on public.portfell_account_emails for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Who already signs in with an address
-- ---------------------------------------------------------------------------
-- auth.users is not reachable over the API at all, not even with the service
-- role, so the one question the server needs answered about it is asked
-- through a function. It returns an id and nothing else: no name, no
-- timestamps, nothing that would turn an address field into a way of reading
-- somebody else's account.

create or replace function public.portfell_account_for_login_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.portfell_account_for_login_email(text) from public;
revoke all on function public.portfell_account_for_login_email(text) from anon;
revoke all on function public.portfell_account_for_login_email(text) from authenticated;
grant execute on function public.portfell_account_for_login_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- Whether an account has ever been used
-- ---------------------------------------------------------------------------
-- Somebody who signed in with their second address before this existed has an
-- empty account sitting on it, and that account is the only thing standing
-- between the address and the account they actually use. An empty account is
-- worth nothing to anybody, so joining the two closes it.
--
-- "Empty" is answered here rather than in the app, and it is deliberately
-- strict: no name on the profile, no answers to the experience questions,
-- nothing to do with money, no portfolio owned or co-owned, no holdings, no
-- circle, no request to join one, no saved conviction notes or watchlist, and
-- no seed portfolio waiting to be claimed. Anything at all that a person
-- would miss makes this false, and then the two accounts are not joined and a
-- human is asked instead.

create or replace function public.portfell_account_never_used(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.portfell_profiles p
      where p.id = p_user
        and (
          p.display_name is not null
          or p.bio is not null
          or p.experience_tier is not null
          or p.knows_options is not null
          or p.stripe_customer_id is not null
          or p.subscription_status is not null
        )
    )
    and not exists (
      select 1 from public.portfell_portfolio_owners o where o.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_portfolios pf where pf.owner_id = p_user
    )
    and not exists (
      select 1 from public.portfell_community_members m where m.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_community_join_requests r where r.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_community_invite_uses u where u.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_lab_state l where l.owner_id = p_user
    )
    /*
      A seed portfolio waiting on this address is a household book that has
      not been claimed yet. The account looks untouched precisely because the
      person has not signed in since it was set up, so closing it here would
      throw away the one thing it was made for.
    */
    and not exists (
      select 1
      from public.portfell_seed_claims sc
      join public.portfell_profiles p on p.id = p_user
      where sc.email = lower(p.email)
    );
$$;

revoke all on function public.portfell_account_never_used(uuid) from public;
revoke all on function public.portfell_account_never_used(uuid) from anon;
revoke all on function public.portfell_account_never_used(uuid) from authenticated;
grant execute on function public.portfell_account_never_used(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Deleting the account takes every way into it
-- ---------------------------------------------------------------------------
-- The foreign key above already clears these when the auth user goes. It does
-- not cover the other shape deletion takes here: with no service role key the
-- app can only remove the profile and its data, and the auth user survives.
-- An address left pointing at an account somebody just wiped is a way back
-- into nothing, so it goes with the rest of it.
--
-- A trigger of its own rather than another line inside portfell_purge_user_data,
-- which would mean re-declaring that whole function to add one statement.

create or replace function public.portfell_before_delete_profile_addresses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.portfell_account_emails where user_id = old.id;
  return old;
end;
$$;

revoke all on function public.portfell_before_delete_profile_addresses()
  from public, anon, authenticated;

drop trigger if exists portfell_profiles_before_delete_addresses
  on public.portfell_profiles;
create trigger portfell_profiles_before_delete_addresses
  before delete on public.portfell_profiles
  for each row
  execute function public.portfell_before_delete_profile_addresses();

comment on table public.portfell_account_emails is
  'Other addresses that open one Upside Lab account. Checked before a Google identity becomes a session; see src/lib/auth/linked-addresses.ts. Adding is the service role''s work, removing is the only write a client may make.';
