/*
  Share splits, which change a holding without anybody buying or selling.

  Nvidia split ten for one on 10 June 2024. Anybody holding a hundred shares
  woke up holding a thousand, each worth a tenth of what it had been, and not
  a cent had changed hands. Every price this app can read is post-split from
  that morning, because the old one cannot be traded again. A holdings row
  still saying a hundred is therefore valued at a tenth of the truth, and the
  person who owns it opens Upside Lab to a portfolio that says they have lost
  ninety per cent of their money.

  It is worse here than in a game. That figure goes into Pulse, which reads it
  as a thesis breaking; into the alerts; and into the Sunday letter, which
  states its numbers as fact and would tell somebody in plain English that
  their week was catastrophic. A reverse split does the same thing in the
  other direction and reads as a windfall.

  Three parts, and each of them is here rather than in the app because the app
  is one refactor away from forgetting and the database is not.

    portfell_share_splits is the ledger. One row per company per effective
    date, and the primary key is what makes applying a split twice impossible
    however many workers notice it at once.

    portfell_split_checks is the day's claim, so one worker asks the provider
    and the rest get on with serving pages.

    portfell_apply_split does the arithmetic, in one transaction.

  What it does to a holding is the whole of the change: the share count is
  multiplied by the ratio and every per-share figure on the row is divided by
  it. That is the buy price, the end of year target and any hand-set stock
  target, because all three are prices of one share and a target of $1,000 on
  a stock that now trades at $100 is not a target anybody set.

  Fractions are kept rather than paid out. Upside Lab holds fractional shares
  already, so a three for two on an odd number is 151.5 shares and not a
  problem to be solved.
*/

create table if not exists public.portfell_share_splits (
  ticker text not null,
  -- The day the new share count is the real one, which is a market open.
  effective_on date not null,

  -- Ten for one is 10 and 1. One for ten, the reverse, is 1 and 10.
  numerator numeric(18, 6) not null,
  denominator numeric(18, 6) not null,

  holdings_adjusted integer not null default 0,
  applied_at timestamptz not null default now(),

  primary key (ticker, effective_on),
  constraint portfell_share_splits_ratio_positive
    check (numerator > 0 and denominator > 0)
);

comment on table public.portfell_share_splits is
  'Every share split applied to holdings, so one can never be applied twice.';

create table if not exists public.portfell_split_checks (
  day date primary key,
  claimed_at timestamptz not null default now()
);

comment on table public.portfell_split_checks is
  'The day''s claim to ask the provider what split. One worker, one ask.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Enabled with no policy at all, which denies everybody. Neither table is any
-- reader's business, and the service role bypasses row level security.

alter table public.portfell_share_splits enable row level security;
alter table public.portfell_split_checks enable row level security;

-- ---------------------------------------------------------------------------
-- portfell_claim_split_check
-- ---------------------------------------------------------------------------
-- True for the first caller on a given day and false for everybody after.
-- There is no release: a check that failed halfway costs nothing to miss,
-- because a split still unapplied is found by tomorrow's check and the ledger
-- means one applied twice is applied once.

create or replace function public.portfell_claim_split_check(p_day date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  insert into public.portfell_split_checks (day) values (p_day)
  on conflict (day) do nothing;

  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

-- ---------------------------------------------------------------------------
-- portfell_tickers_held
-- ---------------------------------------------------------------------------
-- What anybody actually owns, which is the list worth asking about. A split
-- in a company nobody holds changes nothing here.

create or replace function public.portfell_tickers_held()
returns table (ticker text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct upper(h.ticker)
  from public.portfell_holdings h
  where h.shares > 0;
$$;

-- ---------------------------------------------------------------------------
-- portfell_apply_split
-- ---------------------------------------------------------------------------

create or replace function public.portfell_apply_split(
  p_ticker text,
  p_effective_on date,
  p_numerator numeric,
  p_denominator numeric
)
returns public.portfell_share_splits
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger public.portfell_share_splits;
  ratio numeric;
  touched integer := 0;
begin
  if p_numerator is null or p_numerator <= 0
     or p_denominator is null or p_denominator <= 0 then
    raise exception 'a split needs a ratio';
  end if;

  insert into public.portfell_share_splits
    (ticker, effective_on, numerator, denominator)
  values
    (upper(p_ticker), p_effective_on, p_numerator, p_denominator)
  on conflict (ticker, effective_on) do nothing
  returning * into ledger;

  -- Somebody else applied it. Hand back what they wrote rather than doing it
  -- again: this is the guarantee, not an optimisation.
  if ledger.ticker is null then
    select * into ledger from public.portfell_share_splits
    where ticker = upper(p_ticker) and effective_on = p_effective_on;
    return ledger;
  end if;

  ratio := p_numerator / p_denominator;

  /*
    The share count up, every per-share figure down. Rounded to what the
    columns hold, which is four places for shares and prices: a ten for one on
    a price of 109.96 is 10.996 and stays exact, and nothing here is a
    repeating fraction in practice because splits are whole ratios.
  */
  update public.portfell_holdings
  set shares = round(shares * ratio, 4),
      buy_price = round(buy_price / ratio, 4),
      eoy_target = case
        when eoy_target is null then null else round(eoy_target / ratio, 4)
      end,
      stock_target_override = case
        when stock_target_override is null then null
        else round(stock_target_override / ratio, 4)
      end,
      updated_at = now()
  where upper(ticker) = upper(p_ticker)
    and shares > 0;

  get diagnostics touched = row_count;

  update public.portfell_share_splits
  set holdings_adjusted = touched
  where ticker = upper(p_ticker) and effective_on = p_effective_on
  returning * into ledger;

  return ledger;
end;
$$;

revoke all on function public.portfell_claim_split_check(date)
  from public, anon, authenticated;
revoke all on function public.portfell_tickers_held() from public, anon, authenticated;
revoke all on function public.portfell_apply_split(text, date, numeric, numeric)
  from public, anon, authenticated;

grant execute on function public.portfell_claim_split_check(date) to service_role;
grant execute on function public.portfell_tickers_held() to service_role;
grant execute on function public.portfell_apply_split(text, date, numeric, numeric)
  to service_role;
