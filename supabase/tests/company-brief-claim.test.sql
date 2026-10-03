/*
  One writer per company page, proved rather than reasoned about.

  A rewrite is started by whoever opens a company whose page has gone stale,
  and a link passed round a group opens the same company several times in
  the minute a run takes. `portfell_claim_company_brief` is what makes the
  first of them the only one to pay for it. Same shape as
  `fund-run-claim.test.sql`, because it is the same claim.

  Run by `supabase/tests/run.sh`.
*/

\set ON_ERROR_STOP on

begin;

-- The first caller for a company gets it.
do $$
begin
  if not public.portfell_claim_company_brief('MU') then
    raise exception 'the first caller for a company should get it';
  end if;
end $$;

-- Everybody after does not, which is the whole feature.
do $$
begin
  if public.portfell_claim_company_brief('MU') then
    raise exception 'a second caller took a company that was already claimed';
  end if;
end $$;

-- The spelling a caller sends does not make a second claim.
do $$
begin
  if public.portfell_claim_company_brief(' mu ') then
    raise exception 'a lower case spelling took a company that was already claimed';
  end if;
end $$;

-- A company is claimed on its own, not for the whole list.
do $$
begin
  if not public.portfell_claim_company_brief('NVDA') then
    raise exception 'a different company should be its own claim';
  end if;
end $$;

/*
  A writer that died must not hold a company forever, or that page would
  never be rewritten again. A claim older than its window can be taken.
*/
update public.portfell_company_brief_claims
  set claimed_at = now() - interval '10 minutes'
  where ticker = 'MU';

do $$
begin
  if not public.portfell_claim_company_brief('MU') then
    raise exception 'a stale claim should be taken again';
  end if;
end $$;

-- Releasing hands it straight back.
delete from public.portfell_company_brief_claims where ticker = 'NVDA';

do $$
begin
  if not public.portfell_claim_company_brief('NVDA') then
    raise exception 'a released company should be claimable at once';
  end if;
end $$;

-- Nobody but the server may take one.
do $$
begin
  if has_function_privilege(
    'anon',
    'public.portfell_claim_company_brief(text, interval)',
    'execute'
  ) then
    raise exception 'anon can take a claim';
  end if;
end $$;

-- The new column is there and starts empty.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'portfell_company_briefs'
      and column_name = 'checked_at'
  ) then
    raise exception 'checked_at is missing';
  end if;
end $$;

rollback;

\echo 'company-brief-claim.test.sql: one writer per company page'
