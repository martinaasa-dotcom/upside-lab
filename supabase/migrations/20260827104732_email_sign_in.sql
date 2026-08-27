/*
  Sign in with a link mailed to an address, for people who will not use
  Google.

  The token is hashed here the same way a pending extra address is: somebody
  holding a copy of this table still cannot spend it. The row is the one-time
  latch. Mail scanners fetch every URL they see, so the link opens a page
  with a button and does not sign anybody in until that button is pressed.

  No client may read or write this table. Adding a row is what has to check
  that the address can receive mail, and a check a browser runs on its own
  behalf is not a check. The service role is the only caller.
*/

create table if not exists public.portfell_email_logins (
  email text primary key,
  token_hash text not null,
  expires_at timestamptz not null,
  next_path text not null default '/',
  created_at timestamptz not null default now(),

  constraint portfell_email_logins_lowercase check (email = lower(email)),
  constraint portfell_email_logins_shape check (position('@' in email) > 1)
);

create unique index if not exists portfell_email_logins_token_idx
  on public.portfell_email_logins (token_hash);

alter table public.portfell_email_logins enable row level security;

revoke all on table public.portfell_email_logins from public;
revoke all on table public.portfell_email_logins from anon;
revoke all on table public.portfell_email_logins from authenticated;
grant all on table public.portfell_email_logins to service_role;
