/*
  Covered calls a reader has sold, or plans to sell, per portfolio.

  The covered-call panel has only ever suggested a call: here is a strike,
  here is what it pays. Once somebody actually sells one, the questions
  change to whether that call is about to take the shares and whether most
  of what it will ever pay has already been earned, and both need the exact
  contract (strike, expiry, contracts, the premium received) to answer.

  One row per contract line. It belongs to the portfolio rather than the
  person because a portfolio is a brokerage account shared by its
  co-owners, and a call written in that account is written for both of
  them; it cascades with the portfolio for the same reason.

  `status` is 'sold' for a call that is open in the account and 'planned'
  for one the reader means to sell at `premium` or better. Nothing about a
  call is ever computed and stored here: delta and what has been kept are
  read from the market each time, so a row cannot go stale.
*/

create table if not exists public.portfell_covered_calls (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfell_portfolios(id) on delete cascade,
  ticker text not null check (char_length(ticker) between 1 and 24),
  status text not null check (status in ('sold', 'planned')),
  strike numeric not null check (strike > 0 and strike <= 1000000),
  expiry date not null,
  contracts integer not null check (contracts between 1 and 10000),
  premium numeric check (premium is null or (premium > 0 and premium <= 100000)),
  opened_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfell_covered_calls_sold_has_premium
    check (status <> 'sold' or premium is not null)
);

create index if not exists portfell_covered_calls_portfolio_idx
  on public.portfell_covered_calls (portfolio_id, expiry);

comment on table public.portfell_covered_calls is
  'Covered calls a portfolio has sold or plans to sell. Delta and profit are read live, never stored.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Co-owners only, in both directions. Unlike holdings this is not readable
-- by a circle the portfolio is pinned into: a circle shows what somebody
-- owns, and what they have promised to sell it for is theirs.
alter table public.portfell_covered_calls enable row level security;

drop policy if exists "portfell_covered_calls_select" on public.portfell_covered_calls;
drop policy if exists "portfell_covered_calls_insert" on public.portfell_covered_calls;
drop policy if exists "portfell_covered_calls_update" on public.portfell_covered_calls;
drop policy if exists "portfell_covered_calls_delete" on public.portfell_covered_calls;

create policy "portfell_covered_calls_select" on public.portfell_covered_calls
  for select using (public.portfell_is_portfolio_co_owner(portfolio_id));

create policy "portfell_covered_calls_insert" on public.portfell_covered_calls
  for insert with check (public.portfell_is_portfolio_co_owner(portfolio_id));

create policy "portfell_covered_calls_update" on public.portfell_covered_calls
  for update using (public.portfell_is_portfolio_co_owner(portfolio_id))
  with check (public.portfell_is_portfolio_co_owner(portfolio_id));

create policy "portfell_covered_calls_delete" on public.portfell_covered_calls
  for delete using (public.portfell_is_portfolio_co_owner(portfolio_id));
