-- The house's own price plan becomes the site's default, for anybody who
-- has not written their own over it.
--
-- Two things were true before this migration and together they made the
-- product owner's own forecast work invisible everywhere but the account
-- that made it. First, an end-of-year price target was never written to
-- the server at all: `FORECAST_EOY_OVERRIDES_KEY` lived only in the
-- browser's own localStorage, keyed by portfolio, so it could not survive
-- a new device and could not be read by anything server-side. Second,
-- even a *saved* ladder edit (`portfell_lab_state.ladders`) was read back
-- only for the reader who wrote it: `anchorForHolding` and `buildPlanLadder`
-- had no notion of a level anybody else had set.
--
-- `eoy_overrides` puts the target where `ladders` already lives, for the
-- same reason: it is a decision about a company rather than a setting on
-- a device, so it is per owner rather than per portfolio, and a browser
-- with no session yet still needs a local mirror.
--
-- `portfell_house_forecast` is the published half. The house account
-- (`isSuperadminEmail`'s first entry) is the one account whose plan is
-- meant to read as everybody's *starting* point, so its own targets and
-- ladder edits are mirrored into this table whenever it saves one, and
-- every other reader's forecast falls back to a row here before it falls
-- back to the plain arithmetic default -- never before the reader's own.
-- It is never a live cross-account read: reading another account's
-- `portfell_lab_state` on every page view for every reader would be both
-- slow and a boundary this app does not otherwise cross, so the house
-- account's own save is what keeps this table current, same as the
-- monthly popular-tickers snapshot.
alter table public.portfell_lab_state
  add column if not exists eoy_overrides jsonb not null default '{}'::jsonb;

comment on column public.portfell_lab_state.eoy_overrides is
  'Per-ticker end-of-year price targets, keyed by ticker then forecast year. Written by the Growth room; the house account''s own row is mirrored into portfell_house_forecast.';

create table if not exists public.portfell_house_forecast (
  ticker text primary key,
  eoy_prices jsonb not null default '{}'::jsonb,
  ladder jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.portfell_house_forecast is
  'The house account''s own end-of-year targets and ladder edits, one row per ticker, republished as the default anchor for every reader who has not set their own. Written only by the house account''s own save, via service role.';

alter table public.portfell_house_forecast enable row level security;

revoke all on table public.portfell_house_forecast from anon, public, authenticated;
grant select, insert, update, delete on table public.portfell_house_forecast to service_role;
