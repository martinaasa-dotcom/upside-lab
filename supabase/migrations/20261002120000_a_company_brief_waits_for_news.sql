/*
  A company brief is kept until something happens to the company.

  It used to be rewritten every five days, on every one-fifth price move and
  on every new quarter, and "rewritten" meant whoever opened the company
  next waited for a model run of up to a minute. The page is now kept until
  the company reports, an event lands in the news, the price moves a fifth,
  or three weeks pass, and even then the old page is served at once with a
  note while the new one is written behind it. See `brief-store.ts`.

  Two things in the database make that work.

  1. `checked_at` on `portfell_company_briefs`: when the warmer last looked
     at this company against today's figures and headlines. The warmer used
     to walk the published list oldest brief first, which was right while
     every brief expired on a clock. Once most briefs are simply kept, the
     oldest ones are exactly the ones with nothing to do, and a queue
     ordered on `generated_at` would spend every run re-checking the same
     handful of quiet companies at the front while the rest were never
     looked at. Ordered on `checked_at` instead, every published company is
     looked at about once a day. It is never read as a reason to keep a
     page: `generated_at` still says when the model wrote it and is never
     re-stamped, so the age bound stays reachable.

  2. `portfell_company_brief_claims` and `portfell_claim_company_brief`:
     one writer per company. A rewrite is now started by whoever opens a
     stale company, and a link passed round a group opens the same company
     several times inside the minute a run takes. Without a claim each of
     them pays for the same rewrite. It is `portfell_claim_fund_run` again:
     settled on the primary key, never on anything read first, and a claim
     older than its window can be taken again so a worker that died cannot
     hold a company forever. The writer deletes its claim when it finishes.
*/

alter table public.portfell_company_briefs
  add column if not exists checked_at timestamptz;

comment on column public.portfell_company_briefs.checked_at is
  'When the warmer last checked this brief against the company''s figures and headlines. Orders the queue; never extends a brief''s life.';

create index if not exists portfell_company_briefs_checked_at_idx
  on public.portfell_company_briefs (checked_at nulls first);

create table if not exists public.portfell_company_brief_claims (
  ticker text primary key,
  claimed_at timestamptz not null default now()
);

comment on table public.portfell_company_brief_claims is
  'Who is writing a company brief right now. One writer per company; a stale claim can be taken again.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- No policies, matching `portfell_company_briefs` itself: only the server,
-- on the service role, takes or releases a claim. A client that could take
-- one could stop a company's page from ever being rewritten.

alter table public.portfell_company_brief_claims enable row level security;

-- ---------------------------------------------------------------------------
-- portfell_claim_company_brief
-- ---------------------------------------------------------------------------
-- True for the caller that gets the company, false for everybody else.

create or replace function public.portfell_claim_company_brief(
  p_ticker text,
  p_stale_after interval default interval '3 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
  key text := upper(btrim(coalesce(p_ticker, '')));
begin
  if key = '' then
    raise exception 'ticker required';
  end if;

  insert into public.portfell_company_brief_claims (ticker) values (key)
  on conflict (ticker) do update
    set claimed_at = now()
    where public.portfell_company_brief_claims.claimed_at < now() - p_stale_after;

  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.portfell_claim_company_brief(text, interval)
  from anon, public;
grant execute on function public.portfell_claim_company_brief(text, interval)
  to service_role;
