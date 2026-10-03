-- Upside Fund starts again, at $100,000, under rules for one to six months.
--
-- Two reasons, and either alone would be enough.
--
-- The run that started on 2026-09-26 did not race the index it said it
-- did. It started under the QQQ code (20260926120000) and parked the whole
-- $100,000 in QQQ, writing QQQ's close, $744.50, as the benchmark's start.
-- The SPY reset (20260927120000) was never applied, so when the code racing
-- SPY deployed it carried on from that row: the S&P 500 line was drawn from
-- QQQ's $744.50 against SPY's real close that day of $771.35, 3.6% ahead
-- before either side had moved, and the next run treated the QQQ it found
-- as an oversized company, sold nine tenths of it about 1% lower and kept
-- the rest with a stop on it. No holding card showed that loss.
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
-- written today would be a backtest dressed as a track record.
--
-- HOW IT WAS ACTUALLY APPLIED. The session that wrote this could reach the
-- database only over HTTPS, so the restart was done through PostgREST with
-- the service role on 2026-10-03 at 09:06 UTC, after the deploy was live:
-- the old run was copied into the existing `_archive_v1` tables, stamped
-- `archived_at = 2026-10-03 09:06:41.052+00` (the first run in those tables
-- carries its own, earlier stamp), and the four tables were emptied and the
-- fund row reset to $100,000 with an inception date of 2026-10-03. Applied
-- now, this file creates the `_archive_v3` tables holding a copy of
-- whatever run is current, and leaves the Fund alone, because of the guard
-- below.

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

-- The reset only happens on a Fund that started before this file was
-- written, so applying it after the restart described above cannot wipe
-- the new run.
do $$
begin
  if coalesce(
    (select inception_date from public.portfell_margus_fund where id = 'main'),
    date '1900-01-01'
  ) < date '2026-10-03' then
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
  end if;
end $$;

insert into public.portfell_margus_fund (id, cash, starting_capital, inception_date)
values ('main', 100000, 100000, current_date)
on conflict (id) do nothing;
