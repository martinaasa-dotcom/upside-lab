# MVP audit, technical pass (sections 14 to 19)

Run on 2026-08-24 against `main` at `72e7147`. The audit document's own
suggested handoff is sections 14 to 19, "a strong candidate to hand to
Claude Code, since the repo already has purpose-built scripts that a coding
agent can run and interpret directly". This is what those scripts said, what
reading the code said, and what changed as a result.

Four things changed. Everything else on this page is a box that was already
ticked, recorded here with the evidence, because a checklist with no evidence
behind it is worth re-running from scratch next time.

## What the repo's own tooling says

Every one of these is green, on a clean `npm ci`, before any change on this
branch:

| Command | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` (`--max-warnings 0`) | clean |
| `npm test` | 56 files, 382 tests, all passing |
| `npm run validate` | `validate-audit-features: ALL PASSED` |
| `npm run check:edges` | `PASS: no edge-case problems found` |
| `npm run test:invariants` | `all invariants passed` |
| `npm run bench:concurrency` | sim passes, 64 workers, 0 lost updates, 0 deadlocks, 0 dirty reads |
| `npm run build` | clean production build |
| `npm audit --omit=dev` | 0 vulnerabilities |

Two of those were not in CI. They are now: see "What changed" below.

## What changed

### 1. One request could open 120 sockets at a rate-limited provider

`/api/quotes` allows 120 tickers per request and the fallback chain fanned
out with `Promise.all` over all of them, so every provider call started in
the same tick. Each one reads `isMarketCircuitOpen` before any of them has
come back, which means the circuit breaker was structurally unable to stop a
batch it exists to stop.

Measured on the Finnhub leg, which has no batch endpoint and so makes one
call per name, against a feed answering nothing but 429:

    peak concurrency 120, 360 upstream calls

The 360 is the breaker's own retry policy tripling the burst. Finnhub's free
tier is 60 calls a minute, so a single unauthenticated request could spend
six minutes of the shared quota in one tick and record not one failure in
time to prevent the next call.

`mapWithConcurrency` (`src/lib/market/pool.ts`) hands work out as slots free
instead, so the first wave's failures are recorded before the second wave
asks. Same request, after:

    peak concurrency 6, 24 upstream calls

Finnhub is capped at 6, wide enough for the handful of odd tickers a real
book contains and narrow enough that three failures open the circuit and the
other 114 names are skipped before a socket is opened. Yahoo is capped at 48,
above any real book, so a reader's own holdings still resolve in one wave and
normal latency is unchanged. Twelve Data batches into one request and is
untouched. `src/lib/market/pool.test.ts` measures the bound rather than
asserting a shape, and covers the healthy case: 120 names still all get
priced.

### 2. Two checks nothing was running

`npm run bench:concurrency` is the documented way to test what two co-owners
editing one portfolio do to each other, and it had exactly the problem
`test:invariants` had before #115: it exists, it is in the README, and no job
ran it. Without Supabase credentials it skips the live leg and runs the
in-process sim, which is the part that catches a lost update or a reverse
lock order, needs no secrets, and takes about a second. It runs in the
`invariants` job now. The live leg stays a local, deliberate run.

`npm audit` runs in a job of its own, scoped to production dependencies and
blocking only on high or critical. A dev-only or moderate advisory is worth
reading and is not worth blocking a merge on, because a check people learn to
re-run until it passes is not a check.

### 3. A shared rate-limit refusal is now remembered locally

`takeDurableRateLimitWeighted` writes a Postgres refusal back into the memory
bucket and explains why in its own doc. Its sibling `takeDurableRateLimit`
did not, and it is the one guarding the expensive callers: Margus, forecast,
Pulse and the full data export. Someone scripting against a rate-limited
account had every request cost a database round trip that could only ever
come back with the same answer. Each instance learns once now.

## Section 14, frontend engineering quality

- Typecheck, lint and build all clean. Lint is `--max-warnings 0` and runs in
  CI, not just locally, and the husky pre-commit hook was observed running
  `eslint` on every commit made on this branch.
- No source maps reach the client: `find .next/static -name "*.map"` returns 0.
- Server and client boundaries hold where it matters. No file carrying
  `"use client"` references `SUPABASE_SERVICE_ROLE_KEY` or `serviceRole`, and
  the only reader of the key is `src/lib/supabase/env.ts`, which is
  server-only.
- `not-found.tsx`, `error.tsx` and `global-error.tsx` all exist and render
  inside the root layout, so they inherit the theme rather than falling back
  to Next's own light-mode scaffolding.
- Not covered here: "zero console errors on every page in production build"
  needs a running app against a real Supabase project. See "What this pass
  could not reach".

## Section 15, backend architecture and data integrity

- **Invariants, edges, validate.** All three green, and all three now run in
  CI beside the concurrency bench.
- **Timezone.** Every market-clock decision goes through
  `Intl.DateTimeFormat` with an explicit `timeZone`, in
  `src/lib/market/session.ts` and `src/lib/timezone.ts`, so daylight saving
  is the platform's problem rather than an offset typed into the code. The
  `toLocaleDateString` calls elsewhere are display formatting on the client,
  which is where local time is the right answer. The one local-time key in
  the codebase, `weekKey` in `src/lib/weekly-recap.ts`, seeds a rotating
  sign-off string and cannot collide between two Mondays.
- **Row level security.** The final policy state was computed by replaying
  every migration in order and tracking each `create policy` and `drop
  policy`: 63 live policies, and the only survivors carrying `using (true)`
  are the three pre-`portfell_` legacy tables, whose policies are dropped by
  the dynamic block in `20260821120000` and whose tables were then moved out
  of the API-exposed schema entirely by `20260821160000`. The fourth
  apparent survivor, `portfell_share_links_select`, belongs to a table
  dropped in `013`.

  **That was a reading, and a reading cannot tell you whether a policy
  holds.** It is asked of a database now. `supabase/tests/run.sh` builds the
  schema from `shim.sql` plus all 75 migrations against a plain Postgres and
  runs `rls.test.sql`, which acts as the `authenticated` role with a real
  claim, exactly as PostgREST does with a user's token, and goes at the
  tables directly. It asserts that one person cannot read another's
  portfolio, holdings, conviction notes or the owners table that decides all
  three; cannot update, delete or insert into any of them; cannot write
  herself into `portfell_portfolio_owners`, which is the single insert that
  would make every other check pass for the wrong person; and that a
  signed-out request comes away with nothing. It fails when row level
  security is off, which was checked rather than assumed: disabling it on
  `portfell_holdings` produces "Ann sees 2 holdings, expected only her own".
  No credentials and no Docker, so it runs on every pull request. This is
  Upside Arena's harness, which Lab did not have.
- **Environment isolation.** `src/lib/supabase/env.ts` resolves the URL and
  keys from env only, with no hardcoded project, and `check-ci-env.ts` runs
  in the build job specifically to reject a real secret leaking into the
  workflow.

## Section 16, market data

- **The "never make a price up" invariant holds in code.** `fallbackQuotes`
  (the synthetic seed generator in `src/lib/market/yahoo.ts`) is exported and
  has exactly zero call sites. `fetchQuotesWithFallback` walks Yahoo, then
  Twelve Data, then Finnhub, then the last-known cache, and anything still
  unpriced comes back in `missing` rather than as a number.
- **A cached price is labelled.** `mergeCached` stamps `stale: true` and
  `sources[ticker] = "cache"`, and `delayed` is true whenever any name came
  from anywhere other than the primary.
- **Provider limits.** This is where the one real defect was, and it is
  fixed. The per-request ticker cap, the negative cache for unresolvable
  names, and the cost-weighted unresolved budget were all already in place;
  what was missing was a bound on how many of them run at once.
- **Market-closed periods.** `marketSession` distinguishes open, extended and
  closed, and the CDN cache window, poll cadence and `lastCompletedUsSessionKey`
  all key off it. Holidays are deliberately not tracked, and the cost of that
  is documented at the call site: one slow poll cycle.

## Section 17, real time and concurrency

- `bench:concurrency` passes and now runs on every pull request. The sim
  reports 64 overlapping writers, cash landing exactly on 10064/10064, 64
  successful compare-and-swap updates over 2016 retries with none exhausted,
  0 deadlocks and 0 dirty reads, and the reverse lock-order detector fires.
- The holdings write path retries on `23505` and on a compare-and-swap miss,
  and returns a 409 with a sentence a person can read rather than a silent
  overwrite.
- The live leg of the bench, which is the one that exercises the real
  `portfell_apply_cash_delta` RPC against Postgres, needs a service role key
  and did not run here.

## Section 18, security

- **Authorization, not just authentication.** Every one of the 63 API route
  files was checked. Every authenticated route calls `requireAuthUser`;
  every portfolio-scoped route also calls `requirePortfolioOwner`; every
  community route checks membership or admin in code, which
  `test:invariants` asserts independently. The routes with no auth call are
  the deliberately public ones (market data, popular tickers, the demo lock)
  plus the two export routes, whose gate lives one level down in
  `userExportResponse` and was read to confirm it.
- **Writes behind a GET.** Four GET handlers write. Three are self-heal or
  lazy-backfill on rows the caller already owns, one is the cron job. None
  is a state change an attacker gains anything from triggering.
- **CSRF.** Supabase's session cookies are `SameSite=Lax` (confirmed in
  `@supabase/ssr`'s own constants), so a cross-site POST, PATCH or DELETE
  carries no session. That was the whole of the defence, and it is a default
  owned by a dependency rather than a rule this app states, which is exactly
  the kind of protection a later change removes without anything failing.
  `src/proxy.ts` now refuses a mutating `/api/*` request that a browser has
  labelled cross-site, reading `Sec-Fetch-Site` first (page script cannot
  write it) and falling back to `Origin` against the request host. A caller
  with neither header is not a browser and passes through, which is what
  keeps Stripe's signed webhook working: forgery is a browser attack, so a
  browser is what it checks.
- **Body size.** `parseJsonBody` refuses over 1 MB, and checks what actually
  arrived rather than trusting `Content-Length`.
- **Rate limiting.** Per-IP mutation and market limiters in `src/proxy.ts`, a
  durable per-user bucket on every route that costs AI or provider spend, and
  a cost-weighted budget on the quote endpoint charged by upstream calls
  rather than by requests.
- **Secrets.** No secret env name appears anywhere under `.next/static`.
- **Dependencies.** 0 vulnerabilities, and the scan runs on every pull
  request now.

## Section 19, privacy and legal

- `/privacy` and `/terms` both exist. Disclaimer copy lives in one file,
  `src/lib/disclaimer.ts`, and is imported by all seven surfaces that model
  money forward or put words in Margus's mouth, including the Sunday letter.
- `/api/account/delete` and the two export routes exist, are auth gated, and
  the export is rate limited per user on top of the per-IP limiter, because a
  full book export is the most expensive read in the app.
- Margus cannot write. Every tool in `src/lib/ai/cc-advisor.ts` returns a
  proposal and touches no database; the write goes through `/api/holdings`,
  which independently re-checks `requirePortfolioOwner`. A hallucinated tool
  call cannot reach another account's data.

## What this pass could not reach

Everything here needs credentials or a running app, and none of it is
blocked on code:

- The live leg of `bench:concurrency`, and any two-account test of shared
  portfolios, needs `SUPABASE_SERVICE_ROLE_KEY`.
- Console-error sweeps, Core Web Vitals, and the cross-browser and small
  screen passes (sections 13 and 23) need a deployed instance.
- The market-data fallback chain was read and reasoned about rather than
  exercised against real providers, since Twelve Data and Finnhub keys are
  optional and unset here.
- Sections 20 to 22 (Stripe, Resend, analytics) were out of scope for this
  pass and are untouched.
