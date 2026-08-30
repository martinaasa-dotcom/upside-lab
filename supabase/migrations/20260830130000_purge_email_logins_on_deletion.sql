-- A pending sign-in link dies with the account, and with the address.
--
-- Found by the deletion-completeness sweep (account-deletion.test.sql):
-- `portfell_email_logins` keys a hashed sign-in token to a plaintext
-- address, one row per address, deleted when the token is spent. A row
-- whose token was never spent is not deleted by anything, so an account
-- deletion left that address sitting in the table indefinitely -- a small
-- but real gap in "delete my account", and the exact shape the sweep
-- exists to catch: an email-keyed table nothing in the deletion path
-- names.
--
-- Two triggers rather than one, because deletion arrives from two sides
-- and the cascade order between them is not defined. Deleting the auth
-- user (the service-role path) cascades to portfell_profiles and to
-- portfell_account_emails in whichever order Postgres visits them;
-- deleting only the profile (the no-service-role path) reaches
-- account_emails through the addresses trigger. A row trigger on
-- account_emails covers the linked addresses whichever door they leave
-- by, and the profiles trigger covers the primary address, which has no
-- account_emails row.
--
-- The account_emails trigger also fires when a person unlinks one address
-- from a living account, and that is wanted: an address that no longer
-- opens the account must not have a live sign-in link that still would.
-- Additive; CREATE OR REPLACE on the existing addresses trigger function.

create or replace function public.portfell_before_delete_account_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.portfell_email_logins
  where email = lower(old.email);
  return old;
end;
$$;

revoke all on function public.portfell_before_delete_account_email()
  from public, anon, authenticated;

drop trigger if exists portfell_account_emails_before_delete_logins
  on public.portfell_account_emails;
create trigger portfell_account_emails_before_delete_logins
  before delete on public.portfell_account_emails
  for each row
  execute function public.portfell_before_delete_account_email();

create or replace function public.portfell_before_delete_profile_addresses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Row triggers on account_emails purge each linked address's pending
  -- sign-in link as its row goes.
  delete from public.portfell_account_emails where user_id = old.id;
  if old.email is not null then
    delete from public.portfell_email_logins
    where email = lower(old.email);
  end if;
  return old;
end;
$$;

revoke all on function public.portfell_before_delete_profile_addresses()
  from public, anon, authenticated;
