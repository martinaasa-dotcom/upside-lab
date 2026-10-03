-- Upside Fund is measured against the S&P 500 (SPY), not the Nasdaq 100.
--
-- The benchmark is not only the line on the chart. The rules read every
-- company's strength against it, park waiting money in it and hold less in
-- companies when it is under its long average, so a change of benchmark is
-- a change of fund. It started again under QQQ on 2026-09-26, and anything
-- recorded since then (a report's `spy_price`, a recap's weekly return,
-- money parked in QQQ) is in the old benchmark's units. Mixing the two
-- would draw a race whose start line is one fund's price and whose finish
-- is another's, so the Fund starts again once more, with both runners on
-- the same line.
--
-- Nothing is lost: every table is copied into a second set of archive
-- tables first, readable by the service role only, exactly as the first
-- restart did. The `spy_price` and `spy_week_return_pct` columns now mean
-- what their names say again.

create table if not exists public.portfell_margus_fund_archive_v2 as
  select now() as archived_at, f.* from public.portfell_margus_fund f;
create table if not exists public.portfell_margus_fund_holdings_archive_v2 as
  select now() as archived_at, h.* from public.portfell_margus_fund_holdings h;
create table if not exists public.portfell_margus_fund_reports_archive_v2 as
  select now() as archived_at, r.* from public.portfell_margus_fund_reports r;
create table if not exists public.portfell_margus_fund_weekly_recaps_archive_v2 as
  select now() as archived_at, w.* from public.portfell_margus_fund_weekly_recaps w;

alter table public.portfell_margus_fund_archive_v2 enable row level security;
alter table public.portfell_margus_fund_holdings_archive_v2 enable row level security;
alter table public.portfell_margus_fund_reports_archive_v2 enable row level security;
alter table public.portfell_margus_fund_weekly_recaps_archive_v2 enable row level security;

-- Guarded on 2026-10-03, after this file turned out never to have been
-- applied: the run it was written to end carried on under the SPY code,
-- and the Fund was restarted through the API on 2026-10-03 instead (see
-- 20261003120000). Applied now, it must not wipe that newer run, so the
-- reset only happens on a Fund that started before this file was written.
do $$
begin
  if coalesce(
    (select inception_date from public.portfell_margus_fund where id = 'main'),
    date '1900-01-01'
  ) < date '2026-09-27' then
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
