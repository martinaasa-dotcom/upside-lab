-- Local test shim. NOT part of the deployed schema.
--
-- Recreates only the parts of a Supabase project the migrations lean on: the
-- auth schema, the three PostgREST roles, and the two claim readers. It
-- exists so the migrations, their triggers and their row level security can
-- be tested against a plain Postgres, with no Docker and no hosted project,
-- which is what lets `rls.test.sql` run on every pull request.
--
-- Upside Arena has the same file for the same reason. The one difference is
-- `auth.jwt()`: Lab's policies read the email claim as well as the subject,
-- because a superadmin is recognised by address and a person can be invited
-- to a portfolio by one.

create schema if not exists auth;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Supabase's real auth.users has far more columns. These are the ones the
-- migrations read.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

/*
  The request's claims, as Supabase presents them.

  Both readers must return null rather than raise on a signed-out request:
  that is how an anonymous call reaches a security definer function, and a
  policy that throws there fails open in the logs and closed in the product,
  which is the worst pair.
*/
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

/** The subject claim: who is asking. */
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
