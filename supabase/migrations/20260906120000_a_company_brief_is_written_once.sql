-- A company brief is written once and read by everybody.
--
-- The Look up a company room reasons about a company rather than about a
-- portfolio, so unlike almost everything else in this app the answer does
-- not depend on who asked. That is what makes it shareable: the first
-- reader to look up a company pays for the model run, and every reader
-- after them gets the same page for nothing. Without that, a room whose
-- whole point is browsing companies you do not own would put one model
-- call on the free tier for every curious tap.
--
-- The three rules from `portfell_forecast_ticker_cache` are the three
-- rules here, because they were learned the hard way on a table with
-- exactly this shape:
--
-- 1. A row ages out. `generated_at` is compared against a bound in code,
--    so the first reader ever to look a company up cannot fix its page
--    for everybody forever.
-- 2. A row is tied to what it was written from. `anchor_price` is the
--    share price the brief reasoned against, and `facts_key` is a digest
--    of the revenue, profit, debt and cash it read. A company that has
--    reported since, or whose share price has run away from the anchor,
--    is written again rather than reused.
-- 3. `generated_at` is when the model wrote it and is never re-stamped on
--    reuse. Bumping it on every read would make a popular company
--    immortal and rule 1 unreachable.
--
-- Nothing a reader types reaches this table. The prompt is built from the
-- provider's figures and public headlines only, which is what makes the
-- row safe to share; the forecast cache has a whole function
-- (`runIsShareable`) devoted to that question precisely because its prompt
-- does carry the reader's own words, and this one has no such input to
-- guard. The only caller-supplied value is the ticker, and it must resolve
-- to a symbol the provider lists before anything is written.
--
-- Service role only. There is no policy granting anyone else a read or a
-- write: the API route owns this table, and a client that could write it
-- could put a sentence of its own choosing in front of every other reader
-- looking that company up.

create table if not exists public.portfell_company_briefs (
  ticker text primary key,
  brief jsonb not null,
  -- Digest of the figures the brief was written from. See companyFactsKey.
  facts_key text not null default '',
  -- Share price it reasoned against, for the drift bound.
  anchor_price double precision,
  -- When the model wrote it. Never bumped by a reuse.
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfell_company_briefs enable row level security;

comment on table public.portfell_company_briefs is
  'One written company page per ticker, shared by every reader. Service role only.';
comment on column public.portfell_company_briefs.generated_at is
  'When the model wrote this. Never re-stamped on reuse, or the age bound can never fire.';
comment on column public.portfell_company_briefs.facts_key is
  'Digest of the revenue, profit, debt and cash the brief was written from. A new quarter invalidates it.';
