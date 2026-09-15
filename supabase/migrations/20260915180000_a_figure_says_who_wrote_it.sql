-- A figure says who wrote it, because the number alone cannot.
--
-- An end-of-year price target reaches `eoy_overrides` two ways and they
-- are not the same thing. A reader types one into the Growth room's own
-- field, one year on one company, having thought about it. Or a forecast
-- run writes a whole path for every holding at once, which is this app
-- reasoning on their behalf and is a fine thing to show them -- but it
-- lands in the same map, as a bare number, and from that moment nothing
-- in this app can tell the two apart.
--
-- That cost two true sentences. A reader who had never typed a figure in
-- their life was told the price on screen was one they had written down.
-- And the house account's own runs, mirrored into
-- `portfell_house_forecast` as the site's default, were published to
-- every other reader as prices that account had "typed directly rather
-- than reasoned about or computed", which is exactly backwards for a
-- figure a model wrote.
--
-- So each figure gets a word beside it, keyed the same way: ticker, then
-- forecast year, then `yours` or `model`. A year missing from the map is
-- one saved before this column existed, or synced from a device that did
-- not record it, and every sentence about one of those says it was saved
-- earlier rather than guessing which it was. The prices themselves do not
-- move: widening a stored number into an object would break
-- `sanitizeEoyOverrides`, the mirror and four reading surfaces for a fact
-- none of them needs in that shape.
alter table public.portfell_lab_state
  add column if not exists eoy_sources jsonb not null default '{}'::jsonb;

comment on column public.portfell_lab_state.eoy_sources is
  'Who wrote each end-of-year target in eoy_overrides, keyed by ticker then forecast year: "yours" for a figure the reader typed, "model" for one a forecast run wrote. A missing year predates this column and is described as saved earlier, never as either.';

alter table public.portfell_house_forecast
  add column if not exists eoy_sources jsonb not null default '{}'::jsonb;

comment on column public.portfell_house_forecast.eoy_sources is
  'The same answer for the published house default, so a reader drawing it is told whether the house account typed that price or a model run wrote it.';
