-- Shared per-ticker forecast "why" + price path, written after Margus reasons
-- a name out in /api/forecast/plan. Keyed on ticker alone so once anyone's
-- portfolio has priced $RKLB, every other portfolio holding $RKLB reuses that
-- reasoning instead of paying for another model run. conviction_key mirrors
-- the client-side fingerprint (tickerConvictionKey): a cached row generated
-- with no owner thesis is fair game for anyone, but once a specific written
-- thesis shaped the path, only a matching thesis may reuse it. Service role
-- only. Not user data.

create table public.portfell_forecast_ticker_cache (
  ticker text primary key,
  prices jsonb not null,
  rationale text,
  conviction_key text not null default '',
  generated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint portfell_forecast_ticker_cache_ticker_chk check (
    char_length(ticker) between 1 and 24
  )
);

comment on table public.portfell_forecast_ticker_cache is
  'Shared EOY price path + rationale per ticker, reused across portfolios so the same name is not re-reasoned by the model every time it appears.';

alter table public.portfell_forecast_ticker_cache enable row level security;

revoke all on table public.portfell_forecast_ticker_cache from anon, public, authenticated;
grant select, insert, update, delete on table public.portfell_forecast_ticker_cache to service_role;
