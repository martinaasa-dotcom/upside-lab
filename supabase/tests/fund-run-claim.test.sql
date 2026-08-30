/*
  One worker trades the Fund on a given day, proved rather than reasoned
  about.

  The cron used to decide whether it had already run by reading the day's
  report and, if there was none, trading and writing one at the end. That
  is a check and then an act with the whole run in between, and the run
  holds an LLM call, so two workers awake at once both read no report, both
  trade, and both try to write. The unique constraint on `report_date` lets
  exactly one report through, which means a double run does not look like a
  failure: it looks like an ordinary day standing over a portfolio that
  bought twice and sold twice.

  Everything below asks the database rather than the app, because the whole
  point of moving the decision into `portfell_claim_fund_run` is that the
  primary key settles it and no caller can read its way past that.

  Run by `supabase/tests/run.sh`.
*/

\set ON_ERROR_STOP on

begin;

-- The first caller on a day gets it.
do $$
begin
  if not public.portfell_claim_fund_run('2026-08-30') then
    raise exception 'the first caller on a day should get it';
  end if;
end $$;

-- Everybody after does not, which is the whole feature.
do $$
begin
  if public.portfell_claim_fund_run('2026-08-30') then
    raise exception 'a second caller took a day that was already claimed';
  end if;
end $$;

-- A day is claimed on its own, not for the week.
do $$
begin
  if not public.portfell_claim_fund_run('2026-08-31') then
    raise exception 'a different day should be its own claim';
  end if;
end $$;

/*
  A run that died half way must not cost the Fund that day forever. The
  backlog is supposed to come back for it, so a claim older than its window
  can be taken again. The window is far longer than a run can live: the
  route caps itself at 60 seconds.
*/
update public.portfell_margus_fund_runs
  set claimed_at = now() - interval '20 minutes'
  where day = '2026-08-30';

do $$
begin
  if not public.portfell_claim_fund_run('2026-08-30', interval '15 minutes') then
    raise exception 'a stale claim should be takeable, or a crashed run loses the day';
  end if;
end $$;

-- And taking it stamps it fresh, so the next caller is shut out again.
do $$
begin
  if public.portfell_claim_fund_run('2026-08-30', interval '15 minutes') then
    raise exception 'retaking a stale claim should not leave the day open';
  end if;
end $$;

-- A day still inside its window is not reclaimable, however many ask.
do $$
declare
  taken int := 0;
  i int;
begin
  perform public.portfell_claim_fund_run('2026-09-01');
  for i in 1..20 loop
    if public.portfell_claim_fund_run('2026-09-01') then
      taken := taken + 1;
    end if;
  end loop;
  if taken <> 0 then
    raise exception '% callers got a day that was already claimed', taken;
  end if;
end $$;

-- The table is not reachable by a signed-in person: only the service-role
-- cron writes here, and that connection bypasses RLS.
do $$
declare
  policies int;
  rls_on boolean;
begin
  select relrowsecurity into rls_on
  from pg_class where oid = 'public.portfell_margus_fund_runs'::regclass;
  if not rls_on then
    raise exception 'row level security is off on the Fund run claims';
  end if;

  select count(*) into policies
  from pg_policies
  where schemaname = 'public' and tablename = 'portfell_margus_fund_runs';
  if policies <> 0 then
    raise exception 'the Fund run claims table grew % policy(ies)', policies;
  end if;
end $$;

rollback;

\echo 'fund-run-claim.test.sql: one worker trades the Fund on a given day'
