# MVP audit, live pass

Run on 2026-08-24, after the technical pass and the feature accuracy pass.
Everything here came from running the thing rather than reading it: the
container can reach Yahoo and can serve a production build, so several
items the earlier passes recorded as "reasoned about, not exercised" were
finally exercised.

Two bugs, and one of them was in code the previous pass had just merged.

## What running it found

### A spinoff is not a split, and Yahoo reports it as one

**Update, later the same day.** A second implementation of split handling
landed on `main` from another session while this was in flight:
`share-splits.ts`, a ledger, and a cron that applies splits automatically.
It is the better design and it is the one that stays. Two consequences,
both handled in the follow-up:

- Its `fetchSplits` filtered only on "finite and positive", so the GE
  adjustment factors below went straight through it and would have been
  applied to **every** holder of that ticker at once, overnight, by the
  cron, with a ledger row making it permanent. That is strictly worse than
  the version below, where a person had to click. The whole-ratio guard
  moved into `share-splits.ts` as `isRealSplitRatio`, with the GE feed as
  its fixture.
- The read-only detection described below was removed. Its apply button
  wrote through `/api/holdings` without touching the ledger, and
  `portfell_apply_split` is keyed on `(ticker, effective_on)` globally, so
  a reader who clicked before the cron ran would have had the split applied
  twice: shares multiplied by a hundred rather than ten. One system, and it
  is theirs.

The split detection merged in the feature pass was tested against its own
fixtures. Asked for GE's splits, the live feed returns three events:

| date | ratio | what it is |
| --- | --- | --- |
| 2021-08-02 | 1:8 | a real reverse split |
| 2023-01-04 | 1281:1000 | the GE HealthCare spinoff |
| 2024-04-02 | 1253:1000 | the Vernova spinoff |

The last two are spinoff adjustment factors. They restate the historical
price series and leave the share count alone: the holder keeps their shares
and receives shares in a new company. Applying one as a split would have
told a GE holder their 100 shares at $80 had become 128.1 at $62.45, which
is a wrong correction to a real position, the exact thing that file exists
to prevent.

Every genuine split is a small whole ratio, so the fraction is reduced and
both terms must come in under 50. That admits everything anybody does,
including 20:10 written the long way, and rejects a ratio over 1000ths.

### A rate limit keyed on the IP is keyed on the router

Loading a handful of pages in a browser and watching the console, ordinary
page loads started returning 429. That was the public market limiter
working as written, and as written it is wrong.

`mkt:${clientIp(req)}` gives every caller behind one address a single
bucket of 120 requests a minute. This app has classrooms in it: twenty-five
students on one school network are one IP, a page load makes two quote
requests, and the app polls. A class opening it together spends the minute
in the first few seconds and every one of them reads "Too many requests".

A signed-in request is charged to its session now, so the class is
twenty-five callers. Anonymous requests still fall back to the IP, which is
the case the cap is actually for.

## Verified live, having only been reasoned about before

- **"We never make a price up".** `/api/quotes?tickers=ZZQQXXNOTREAL`
  returns `quotes: {}`, `missing: ["ZZQQXXNOTREAL"]` and no number. In a
  batch of twenty, a delisted name (NKLA) comes back in `missing` while the
  other nineteen price normally from Yahoo.
- **Split parsing against real data.** NVDA's 10 for 1 on 2024-06-10 and
  AAPL's 4 for 1 on 2020-08-31 both arrive in exactly the shape
  `readSplitEvents` expects. `events.splits` comes back as an array here,
  which is one of the two shapes it handles.
- **Authorization, by probe rather than by reading.** Unauthenticated GET
  to `/api/book/nav-history`, `/api/portfolios`, `/api/lab` and
  `/api/auth/me` all return 401. `/api/quotes` is public by design.
  `/api/internal/telemetry` is 405 on GET.
- **No horizontal overflow** at 320, 390, 768 and 1440 on `/`, `/login`,
  `/privacy`, `/terms` and an unmatched URL.
- **The 404 page** renders on brand at a 404 status, inside the app's own
  theme rather than Next's light-mode scaffolding.

## Still not reachable

- Anything behind a session: the signed-in screens, a two-account shared
  portfolio, the split notice rendering against a real split. Placeholder
  Supabase credentials cannot open a session, so `/login` never resolves
  here and every authenticated route correctly answers 401.
- The Twelve Data and Finnhub legs of the fallback chain. Their keys are
  optional and unset, so only the Yahoo leg and the miss path were
  exercised.
- Screenshot parsing against a spread of real broker apps.
