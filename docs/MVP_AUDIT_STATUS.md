# MVP audit: where every section stands

One page over the whole checklist, run 2026-08-24. The three passes behind
it are `MVP_AUDIT_TECHNICAL_PASS.md` (sections 14 to 19),
`MVP_AUDIT_FEATURE_PASS.md` (1 to 8) and `MVP_AUDIT_LIVE_PASS.md`
(everything that needed the app actually running).

Each line is **fixed**, **verified** (checked and correct, with the working
recorded), **blocked** (needs credentials or a person, not code), or
**open**.

## The seven bugs

Every one of them put a wrong number or a broken flow in front of a reader.

| | what it was | measured |
| --- | --- | --- |
| 1 | A split made every number on a row wrong | Nvidia's 10 for 1: a position shown at a tenth of its worth, down 90%, as fact |
| 2 | A spinoff counted as a split | GE's `1281:1000` would have turned 100 shares into 128.1 |
| 3 | Daily compounding built the year out of 360 days | $26,809.37 against a closed form of $27,179.10 |
| 4 | The diversification panel answered its own question backwards | a perfect hedge reported as +0.93 instead of -1.00 |
| 5 | The seasonality card counted the month in progress | a 10% month averaged to 7.5%, win rate 100 to 75 |
| 6 | Pasting a screenshot into Margus failed | client allowed 4.5 MB, server refused over 1 MB |
| 7 | A rate limit keyed on the router, not the reader | a class of 25 on one school network spent the minute in seconds |

Plus, without a reader ever having seen them: one request could open 120
sockets at a rate-limited provider (measured 360 upstream calls, now 24), a
chat turn could push 90 MB of input at the model in five minutes, a shared
rate-limit refusal cost a database round trip on every subsequent request,
and CSRF rested entirely on a dependency's cookie default.

## Section by section

### 1 to 3, scope, accuracy, Margus
- **1.1 core loop, side rooms, docs drift** verified. `README`, `CLAUDE.md`
  and `AGENTS.md` read against the build; the rename, the removed house
  view and the walkthrough all match what ships.
- **1.2 / 19 not-a-broker framing** verified. One `disclaimer.ts`, imported
  by all seven surfaces that model money forward, the Sunday letter
  included. Nothing anywhere implies a trade is placed.
- **1.3 / 16 "we never make a price up"** verified **live**: an unknown
  ticker returns `missing` and no number, a delisted name in a batch of
  twenty comes back missing while the rest price. `fallbackQuotes` has
  zero call sites.
- **2.1 portfolio** fixed (splits, twice) and verified (cost basis, today's
  move, one lot per ticker, covered call math by hand).
- **2.2 Pulse** verified: fires at exactly -5% on the effective move,
  pre-market and after-hours included.
- **2.3 Lab** fixed (correlation) and verified (allocation sums to 1,
  `sma` / `ema` / Wilder `rsi` / `macd` / `relativeStrength` against their
  standard definitions).
- **2.4 Compound** fixed, and now 18 tests against closed form where there
  were none.
- **3.1 Margus read/edit safety** verified. Every tool returns a proposal
  and touches no database; the write goes through `/api/holdings`, which
  re-checks ownership independently. A hallucinated call cannot reach
  another account.
- **3.3 / 3.4 abuse and cost** fixed: a per-turn body cap and a budget
  charged by weight, beside the existing per-user count.
- **3.2 hallucination guardrails** open. The portfolio context is supplied
  by the client, which is not a cross-account risk (the only book a client
  can lie about is its own) but does mean adversarial prompting was not
  tested here.

### 4 to 8, auth, sharing, communities, Fund, import
- **4 / 5 / 6 / 7** blocked. Every flow needs two real sessions.
  Authorization was checked statically across all 63 route files and by
  probe on the public ones; the invariants suite independently asserts
  every community route checks membership in code.
- **8 import** fixed (screenshot size) and verified (per-row CSV reporting
  with line numbers, dialect detection, and re-import being a set
  operation so the same file twice cannot double a position).

### 9 to 13, IA, design, UX, copy, responsive
- **9 sitemap** verified: 14 page routes, listed in the live pass.
- **10 / 12 design and copy** verified by the repo's own suites, which now
  run in CI: `test:invariants`, `check:edges`, `reader-copy.test.ts` (no em
  dash, no "sheet" or "book" in any JSX text node), `heading-scale`,
  `dock-stability`, `bottom-notice`, `ambient-dither`.
- **11 contrast** verified by measurement. Against the true-black field:

  | token | hex | ratio | AA body |
  | --- | --- | --- | --- |
  | `--foreground` | `#fafafa` | 20.11 | pass |
  | `--primary` | `#d4bc79` | 11.24 | pass |
  | `--gain` | `#00bc7d` | 8.52 | pass |
  | `--muted-foreground` | `#a1a1a1` | 8.10 | pass |
  | `--destructive` | `#ff6467` | 7.26 | pass |
  | `--loss` | `#f2435f` | 5.74 | pass |
  | `--warning` | `#ed4900` | 5.53 | pass |

  Every one clears AA for body text. Worth noting for anyone reading
  Arena's notes beside these: Arena had to move `--destructive` because it
  uses the colour as a **solid fill under white text**, where it measured
  2.46:1. Lab never does that. Every `--destructive` here is a low-alpha
  tint with `text-destructive` on near-black, which is the 7.26 above, so
  the same token is correct in one app and wrong in the other for a
  reason. Do not copy Arena's value across without checking which way
  round the colour is used.
- **11 keyboard and screen reader** open. Focus traps and tab order were
  not walked.
- **13 responsive** partly verified: no horizontal overflow at 320, 390,
  768 and 1440 on every route reachable signed out. The dense signed-in
  tables and charts, which the audit calls the most likely to break, are
  behind a session.

### 14 to 19, technical
All verified or fixed; see `MVP_AUDIT_TECHNICAL_PASS.md`. Headline: the
repo's own tooling is green and now runs in CI in full, RLS was verified by
replaying every migration and tracking each create and drop, and the
provider fan-out and CSRF gaps are closed.

### 20 to 23
- **20 Stripe** verified. Signature checked, and every handler **re-fetches
  the subscription by id** rather than trusting the embedded snapshot, so
  duplicate and out-of-order events converge on the same write. That is a
  stronger idempotency guarantee than an event-id table. A write that
  matches no profile returns 500 so Stripe redelivers, rather than
  acknowledging a payment nobody was granted. End-to-end checkout in test
  mode is blocked.
- **21 notifications** verified in code (three independent guards against a
  double send, per-recipient claim, Resend idempotency key, and a letter
  that refuses to send on thin numbers, now including a pre-split share
  count). Actual delivery and client rendering are blocked.
- **22 analytics** fixed. Fourteen client events and six server events are
  logged, covering import, Margus, Pulse, invites and the walkthrough, and
  the admin page already carried a real activation funnel: signed in, has a
  portfolio, has holdings, used Margus or Pulse, visited this week, active
  this week. What it did not carry was revenue. For an app taking real
  money through Stripe that leaves out the two numbers the owner most needs
  after launch, and one of them is urgent: a card that fails puts a
  subscription into `past_due` and nothing on the page would have said so.
  **Subscribed** and **Payment failing** are the last two steps now, read
  off `portfell_profiles`, whose only writer is the Stripe webhook, so it
  is Stripe's own answer rather than a second copy kept in sync by hand.
  A signup event is still not logged and does not need to be:
  `portfell_profiles.created_at` is the signup, exactly once, by
  construction, and `signedIn` counts it.

  `AdminPage` was restating the funnel's shape rather than importing it,
  which is how the page would have gone on rendering six numbers while the
  route computed eight. It imports the type now, and the module has tests,
  which it did not.
- **23 performance** verified on the part that is checkable statically:
  every candidate N+1 was traced and all are either batched with `.in()`
  already or bounded by a hardcoded list. Core Web Vitals are blocked.

### 24 to 30, process
- **24 QA** partly fixed: 458 tests now, up from 382, with the new ones on
  the riskiest logic (splits, compounding, correlation, seasonality, the
  fan-out bound, rate-limit bucketing).
- **25 migrations** verified: the timestamp convention holds, the legacy
  numbered files are untouched, and no migration was added by this work.
- **26 disaster recovery** fixed, and it was never as blocked as this page
  first said. Running the real thing against production still needs
  credentials, but the part that matters does not: every stage had a test of
  its own (encryption round-trips, the checksum notices drift, the export
  builds a snapshot, the restore reads one) and **nothing covered the
  chain**, which is where a backup fails silently. A field dropped between
  capture and restore, a checksum taken over a different shape, a manifest
  pointing at a key nothing wrote: each passes every unit test and loses the
  book. `restore-rehearsal.test.ts` runs capture, checksum, encrypt, sign,
  upload, fetch back, decrypt, restore and compare in one go through the
  real code, against an in-memory object store, and asserts the snapshot is
  never in the clear and that a tampered one is refused. Upside Arena proves
  the same thing in `scripts/restore-rehearsal.sh`, which is where the idea
  came from: its backup is a `pg_dump` and this one is a JSON snapshot, so
  it is the same rehearsal with different plumbing.
- **27 devops** fixed: `bench:concurrency` and `npm audit` now run in CI
  beside typecheck, lint, test, invariants and build. Husky was observed
  blocking on every commit in this work.
- **28 to 30** are for a person, not for code.

## The short list

If only three things are done next, these are the three:

1. **A two-account session pass.** Sharing, communities, classroom
   permissions and concurrent edits are the largest untested surface, and
   the only thing standing in the way is credentials.
2. **Restore from a backup, once, against production.** The chain itself is
   rehearsed on every pull request now, so what is left is proving the
   nightly job is pointed at the right database, which is the one part a
   rehearsal cannot answer.
3. **Watch the funnel once it is live.** It reaches revenue now, and
   **Payment failing** is the cell to look at first: it is the only number
   on the page that means somebody has to do something today.
