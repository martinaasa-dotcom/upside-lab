/*
  One worker trades the Fund on a given day, however many wake up.

  The Fund cron decided whether it had already run by reading the day's
  report and, if there was none, trading and writing one at the end. That is
  a check and then an act with the whole run in between: two workers awake
  at once both read no report, both trade, and both try to write. The unique
  constraint on `report_date` then lets exactly one report through, so the
  visible outcome of a double run is one ordinary-looking report standing
  over a portfolio that bought twice and sold twice.

  It is not a hypothetical arrangement. The schedule fires several times a
  day, Vercel documents that a schedule can fire twice, and the run holds an
  LLM call in the middle, so the window where two of them overlap is the
  length of that call rather than an instant.

  This is `portfell_split_checks` again, for the same reason and in the same
  shape: the day is claimed before the work rather than inferred from its
  result. The one difference is the stale window. A split check that dies
  half way costs nothing to miss, because tomorrow's check finds the split
  and the ledger makes applying it twice impossible; a Fund day that dies
  half way is a day the backlog is supposed to come back for. So a claim
  older than the window can be taken again, and the window is far longer
  than a run can live: the route caps itself at 60 seconds.
*/

create table if not exists public.portfell_margus_fund_runs (
  day date primary key,
  claimed_at timestamptz not null default now()
);

comment on table public.portfell_margus_fund_runs is
  'The day''s claim to trade the Fund. One worker, one run.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Deliberately no policies at all, matching the Fund's own tables: only the
-- service-role cron writes here, and that connection bypasses RLS. Nobody
-- reaching this table through the API can take or release a claim.

alter table public.portfell_margus_fund_runs enable row level security;

-- ---------------------------------------------------------------------------
-- portfell_claim_fund_run
-- ---------------------------------------------------------------------------
-- True for the worker that gets the day, false for everybody else, decided
-- by the primary key rather than by anything the caller reads first.

create or replace function public.portfell_claim_fund_run(
  p_day date,
  p_stale_after interval default interval '15 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  if p_day is null then
    raise exception 'day required';
  end if;

  insert into public.portfell_margus_fund_runs (day) values (p_day)
  on conflict (day) do update
    set claimed_at = now()
    where public.portfell_margus_fund_runs.claimed_at < now() - p_stale_after;

  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.portfell_claim_fund_run(date, interval)
  from anon, public;
grant execute on function public.portfell_claim_fund_run(date, interval)
  to service_role;
