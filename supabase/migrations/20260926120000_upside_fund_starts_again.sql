-- Upside Fund starts again, at $100,000, under written rules.
--
-- The first version asked a language model once a day whether it wanted
-- to trade, under a prompt that said most days it should not, and it made
-- almost no trades. Its record is kept rather than deleted: every table is
-- copied into an archive table first, readable by the service role only,
-- so nothing about the old run is lost and it can be restored by hand.
--
-- From here the benchmark is the Nasdaq 100 (QQQ). The reports'
-- `spy_price` and the recaps' `spy_week_return_pct` carry the benchmark's
-- price and weekly return from this point on; the columns are not renamed
-- because a rename would break every deployed reader of them at once.

create table if not exists public.portfell_margus_fund_archive_v1 as
  select now() as archived_at, f.* from public.portfell_margus_fund f;
create table if not exists public.portfell_margus_fund_holdings_archive_v1 as
  select now() as archived_at, h.* from public.portfell_margus_fund_holdings h;
create table if not exists public.portfell_margus_fund_reports_archive_v1 as
  select now() as archived_at, r.* from public.portfell_margus_fund_reports r;
create table if not exists public.portfell_margus_fund_weekly_recaps_archive_v1 as
  select now() as archived_at, w.* from public.portfell_margus_fund_weekly_recaps w;

alter table public.portfell_margus_fund_archive_v1 enable row level security;
alter table public.portfell_margus_fund_holdings_archive_v1 enable row level security;
alter table public.portfell_margus_fund_reports_archive_v1 enable row level security;
alter table public.portfell_margus_fund_weekly_recaps_archive_v1 enable row level security;

delete from public.portfell_margus_fund_holdings;
delete from public.portfell_margus_fund_reports;
delete from public.portfell_margus_fund_weekly_recaps;
delete from public.portfell_margus_fund_runs;

alter table public.portfell_margus_fund alter column cash set default 100000;
alter table public.portfell_margus_fund alter column starting_capital set default 100000;

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
