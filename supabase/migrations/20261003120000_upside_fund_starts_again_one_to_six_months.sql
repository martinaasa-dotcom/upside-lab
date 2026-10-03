-- Upside Fund starts again, at $100,000, under rules for one to six months.
--
-- Two reasons, and either alone would be enough.
--
-- The run that started on 2026-09-26 did not start where it said it did.
-- The reset to the S&P 500 (20260927120000) was applied before the code
-- racing SPY had deployed, so the old code ran once more: it parked the
-- whole $100,000 in QQQ and wrote QQQ's close, $744.50, as the S&P 500's
-- starting price, against SPY's real close that day of $771.35. The index
-- line was drawn 3.6% ahead before either side had moved, and the next
-- run, now racing SPY, treated the QQQ it found as an oversized company:
-- it sold nine tenths of it about 1% lower and kept the rest with a stop
-- on it. The loss on that sale is real arithmetic on trades that should
-- never have happened, and no holding card showed it.
--
-- And the rules changed. The Fund now also buys a leader closing at a new
-- three-month high, holds for one to six months rather than up to twelve,
-- and sells a company that has fallen well behind the S&P 500 (see
-- `fund-strategy.ts`, where every number carries its measurement). A
-- change of rules is a change of fund, which is the argument the last
-- restart made for a change of benchmark.
--
-- The week is not replayed under the new rules. The Fund room promises
-- that nothing is edited afterwards, and a record rewritten with rules
-- written today would be a backtest dressed as a track record. So it
-- starts again, and the old run is kept: every table is copied into a
-- third set of archive tables first, readable by the service role only.
--
-- APPLY THIS ONLY AFTER THE DEPLOY CARRYING THE NEW RULES IS LIVE. Applied
-- first, the cron still running the old code trades the fresh $100,000 under
-- the old rules, which is exactly how the last restart went wrong.

create table if not exists public.portfell_margus_fund_archive_v3 as
  select now() as archived_at, f.* from public.portfell_margus_fund f;
create table if not exists public.portfell_margus_fund_holdings_archive_v3 as
  select now() as archived_at, h.* from public.portfell_margus_fund_holdings h;
create table if not exists public.portfell_margus_fund_reports_archive_v3 as
  select now() as archived_at, r.* from public.portfell_margus_fund_reports r;
create table if not exists public.portfell_margus_fund_weekly_recaps_archive_v3 as
  select now() as archived_at, w.* from public.portfell_margus_fund_weekly_recaps w;

alter table public.portfell_margus_fund_archive_v3 enable row level security;
alter table public.portfell_margus_fund_holdings_archive_v3 enable row level security;
alter table public.portfell_margus_fund_reports_archive_v3 enable row level security;
alter table public.portfell_margus_fund_weekly_recaps_archive_v3 enable row level security;

delete from public.portfell_margus_fund_holdings;
delete from public.portfell_margus_fund_reports;
delete from public.portfell_margus_fund_weekly_recaps;
delete from public.portfell_margus_fund_runs;

update public.portfell_margus_fund
set cash = 100000,
    starting_capital = 100000,
    inception_date = current_date,
    watchlist = '[]'::jsonb,
    cash_purpose = null,
    updated_at = now()
where id = 'main';

insert into public.portfell_margus_fund (id, cash, starting_capital, inception_date)
values ('main', 100000, 100000, current_date)
on conflict (id) do nothing;
