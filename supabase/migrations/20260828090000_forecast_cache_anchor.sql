/*
  The shared forecast cache had no way to go stale.

  20260827130000 keyed a five-year price path on the ticker alone and read it
  back forever: the first portfolio ever to hold a name fixed that name's
  forecast for every reader in the product, permanently. A path is only
  meaningful next to the price it was reasoned from, so the row now records
  that price and the reader-facing code bounds a row two ways, by age and by
  how far the stock has moved since (src/lib/forecast-ticker-cache-store.ts).

  Existing rows have no anchor. They keep working and are judged on age
  alone, so nothing re-runs the model for every holding the day this lands.
*/

alter table public.portfell_forecast_ticker_cache
  add column if not exists anchor_price double precision;

comment on column public.portfell_forecast_ticker_cache.anchor_price is
  'Share price the cached path was reasoned from. A row whose stock has moved far from this is re-reasoned rather than reused. Null on rows written before this column existed, which are then bounded by age alone.';

comment on column public.portfell_forecast_ticker_cache.generated_at is
  'When the model actually reasoned this path. Never bumped by a later run that only reused the row, or the age bound could never expire it.';
