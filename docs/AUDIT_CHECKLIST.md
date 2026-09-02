# Audit checklist

A standing reference, not a dated record like `MVP_AUDIT_LIVE_PASS.md`. That
file is what running the app on one day in August found; this file is the
full list of passes worth running — some of them mechanically, most of them
by reading — before trusting a change, a release, or a quiet week where
nothing seemed to break. Each pass names what to check, how to check it, and
why it is on the list. The "why" is load-bearing: several of these exist
because skipping them once already cost something, and the incident is the
argument for keeping the check rather than trusting memory.

The automated floor is `npm run test:invariants && npm run check:edges &&
npm run validate && npm run bench:concurrency && npm test && npm run
typecheck && npm run lint && npm run build && ./supabase/tests/run.sh`.
CI (`.github/workflows/ci.yml`) already runs all of it on every PR, plus
`npm audit --omit=dev --audit-level=high` and a landing-page smoke test.
None of the passes below duplicate that — they are the things a green CI run
does not prove, because they need a human reading the code, running the app,
or looking at the actual data.

## 1. Money is never wrong

The one category where being wrong is not a bug report, it is a dollar
figure somebody acts on.

- **Splits apply once, globally, and never twice.** Read
  `src/lib/share-splits.ts` and the `portfell_apply_split` /
  `portfell_split_checks` migration (`20260824120000_share_splits.sql`).
  Confirm there is exactly one code path that mutates share counts for a
  split — a second implementation reappearing (a client-triggered "fix my
  holding" button, say) is the exact incident recorded in the "more than one
  session" note in `AGENTS.md`: two correct systems touching the same rows
  is a bug even when neither is. Check `isRealSplitRatio` still rejects
  spinoff adjustment factors (GE HealthCare, GE Vernova) alongside real
  splits. `src/lib/share-splits.test.ts`.
- **`fetchSplits` distinguishes "could not ask" from "asked, nothing
  happened."** `null` vs `[]` — grep every caller of `fetchSplits` and
  confirm none of them treats a `null` as "no splits today." A provider
  outage must not read as a quiet day.
- **Cash moves by a database-applied delta, never a read-then-write
  total.** `portfell_apply_cash_delta` (migration 041). Run
  `src/lib/cash-delta-atomicity.test.ts` and re-grep for any new
  `cash_balance:` write that both reads a balance and adds to it in the
  same statement — that pattern is exactly what caused the classroom
  starting-cash bug the migration fixed.
- **The Fund claims a day before it trades, not after.**
  `portfell_claim_fund_run` — confirm the cron still checks the claim RPC
  before calling the LLM, not a `SELECT` of today's report. Confirm the
  `42883`/`PGRST202`/wording fallback for an unmigrated function still
  falls through to old behavior rather than silently standing down.
  `src/lib/fund-claim-migration-gap.test.ts`.
- **The forecast is never floored, lifted, or reshaped in magnitude.**
  `src/lib/forecast-floor.test.ts` — a declining, flat, and modest path all
  reach the reader untouched. Grep for any new post-processing step between
  the model's answer and the response payload; the only sanctioned
  transform is `reshapeToThemeRhythm` (timing only, same destination
  price) and gap-filling for names the model skipped.
- **Cash goes negative and stays negative.** `isSafeSignedMoney` caps
  magnitude, nothing clamps sign. Re-check `GET /api/portfolios`, the PATCH
  route, and `CashModal` for any reintroduced `Math.max(0, ...)` — four
  separate places did this before and together they hid a $7,000 loan as
  $0 owed.
- **Nothing rounds a figure up into existence.** `aboutMove`/`aboutPct`
  (`src/lib/book-insights.ts`, `src/lib/morning-read.ts`) print "less than
  1%" below a whole point rather than rounding to "about 1%". Check any new
  reader-facing percent/dollar sentence for the same floor-vs-round
  distinction.
- **Margin health tiers and the arithmetic behind them.**
  `src/lib/margin-health.ts` — `MAINTENANCE_RATE` stays 0.5 (deliberately
  conservative, and the copy says so), tiers at 30%/50%, and the alert id
  carries its tier (`decision-margin-heavy` etc.) so a dismissal at one
  tier does not silence a worse one later. `margin-health.test.ts`.
- **A letter states its numbers as fact, so a letter with thin numbers
  does not send.** `weeklyNumbersAreSound` — re-verify the three refusal
  conditions (any holding missing a quote, a cached quote older than four
  days, week-move coverage under 90% of portfolio value) still gate
  `dispatchWeeklyLetters`, and that a skipped recipient keeps their empty
  marker for retry rather than being marked sent.
- **A week return is a fraction until `weekPctOf` says otherwise.** Grep
  any new consumer of `fetchWeekReturns` for a raw `pct` used as a
  percent — this produced `+0.3%` beside a 30% week before.

## 2. Ledger and cache staleness

- **The forecast ticker cache ages out, is priced-anchored, and never
  publishes what the model did not say.** `src/lib/forecast-ticker-cache-store.ts`
  — confirm the 14-day age bound, the 20% price-drift refusal, that
  `generated_at` is stamped only when the model actually reasoned (never
  re-stamped on reuse), and that `ensureCompleteEoyTargets`'s
  generically-shaped fills for names the model skipped are never written
  back to the shared cache. `forecast-ticker-cache.test.ts`.
- **Pagination never silently truncates at PostgREST's 1,000-row
  default.** `src/lib/supabase/read-all.ts` (`readAll`, pages at 500,
  `"throw"` vs `"stop"` per caller). Run `src/lib/complete-reads.test.ts` —
  it scans call sites textually, so any query built inside a helper or a
  try block is invisible to it and needs a manual read. Re-check the
  Sunday letter mailing list, the nightly snapshot, and the GDPR export
  specifically; they are the three that were silently truncating before
  this was caught, plus eleven more found in the same pass.
- **A database error never reaches a response body.** `src/lib/db-error.ts`
  — `dbError` logs server-side and returns `DB_ERROR_MESSAGE`; `db-error.test.ts`
  scans every route file for a restored raw `.message`. The two `verdict.message`
  sites (this app's own validation copy) are the sanctioned exceptions.

## 3. Auth, identity, and access

- **One account, however many mailboxes.** `src/lib/auth/account-addresses.ts`
  — the Google leg proves itself in-handshake and adds on the spot; every
  other address is mailed a link and never signs anyone in on its own. Confirm
  the destructive "take over an existing account" path still requires
  `portfell_account_never_used` (no name, no answered onboarding questions,
  nothing bought, no portfolio owned/co-owned, no circle, no join request, no
  conviction notes, no watchlist, no pending seed portfolio) before it is
  allowed, and that two used accounts still refuse and route to support
  rather than picking a loser. `account-addresses.test.ts`.
- **No second auth user is ever minted for a known address.** Re-check that
  adding an address never calls Supabase's own `linkIdentity`, and that
  `portfell_account_aliases` (member-list display only) is not mistaken for
  the account-emails mechanism that actually merges sessions.
- **The forged-request gate covers every mutation, not just `/api/*`.**
  `src/proxy.ts` — confirm the check still runs before the `isApi` branch
  opens. `/auth/email/complete` is the route that motivated this; re-check
  any new page-path POST lands inside the same guard rather than outside it.
- **Community membership is opt-in only.** Grep for any insert into
  `portfell_community_members` that is not gated by an accepted invite, an
  admin-approved join request, or household circle mirroring
  (`portfell_household_groups`). `ensureProfileAndClaims` must never
  auto-join. Never share a real portfolio into a classroom; never
  auto-join a classroom on sign-in.
- **Row-level security actually holds, not just reads correctly.**
  `supabase/tests/run.sh` (the CI `sql` job) builds the schema from every
  migration and asks Postgres, as the `authenticated` role, whether one
  person can reach another's portfolio, holdings, or conviction notes.
  Run it locally after any RLS-touching migration rather than trusting the
  policy text.
- **Session-hint is a hint, never an authority.** `src/lib/session-hint.ts`
  — the inline script marks `<html data-session>` before hydration so a
  signed-in reader is never shown the marketing landing page; confirm
  `AuthProvider` still re-stamps on every resolved session, resolved
  absence, sign-out, and account switch, and that the root layout still
  never reads the session cookie server-side (that would cost every route
  its static rendering to answer a question the browser already knows).
  `session-hint.test.ts`.

## 4. Market data, scheduling, and freshness

- **Every cron actually fires and actually claims its work.** Read
  `vercel.json`'s `crons` block against each route's own idempotency
  mechanism: `snapshot` (02:00 UTC), `margus-fund` (23:30 UTC weekdays +
  11:00 UTC six days, both hitting `portfell_claim_fund_run`),
  `sunday-note` (04:00 UTC plus two `?resume=1` slots, each behind
  `requestIsScheduledCron` + `claimRecipient` + a Resend idempotency key),
  `popular-tickers` (monthly), `empty-book-nudge` (daily), `splits`
  (15:00 UTC weekdays, after the open in both halves of the year),
  `disaster-recovery` (03:00 UTC), `billing-reconcile` (05:00 UTC). A
  schedule that only makes sense in one hemisphere's market hours is a bug.
- **Free-tier fallback chains degrade instead of failing.**
  `src/lib/market/quotes.ts`, `src/lib/ai/model.ts` — confirm a new market
  or LLM integration extends the chain rather than being hard-depended on
  directly, and that `withAdvisorFallback` still records the provider that
  actually answered (see the provenance pass below).
- **The overnight window is a data fact, decided server-side.**
  `/api/market/overnight` — the dead window (20:00–04:00 New York) answers
  `{indication: null}` outside it; the client never guesses from its own
  clock. `overnight.test.ts` covers window boundaries and the Friday-close
  anchor.
- **Quote cadence ordering, not the exact numbers.** `quotePollMs` vs
  `quoteViewMaxAgeMs` in `src/lib/market/session.ts` — every reader-triggered
  view (opening a room, returning to a tab, switching portfolio) must ask
  `isQuoteFreshForView`, never `isQuotePollFresh`; only background timers ask
  the latter. `session.test.ts` asserts the ordering, not literal constants.
- **A ticker alias resolves to what the reader picked, not what they typed
  last.** BTC/SOL/LINK ambiguity — `tickerFieldText` prettifies a stored
  symbol only; confirm both holding-creation paths (`HoldingModal`,
  `WelcomeTour`) still store the picked symbol rather than re-deriving it
  from on-screen text.
- **Screenshot import only opens from a real tap.** `useScreenshotPicker` —
  grep for any `.click()` on the hidden file input from a `useEffect` or
  layout hook; that fires Mobile Safari's camera prompt unprompted.
- **CSV import keeps working for people who are not Martin.** Exercise
  `src/lib/csv-import.ts` against a handful of real broker export formats
  periodically — this is the primary onboarding path for anyone without a
  screenshot to paste.

## 5. AI behavior and provenance

- **No ticker-specific or theme-specific bias reintroduced.** Grep for
  `CALL_PCT_BASELINES`, `STOCK_TARGET_BASELINES`, `TICKER_BASE_MULTS`, or
  any new per-ticker floor in `src/lib/forecast-conviction.ts` /
  `src/lib/market/write-plan.ts`. Call % must still derive purely from each
  ticker's own realized volatility.
- **No named strategist or macro stance in the default prompts.**
  `MARGUS_PERSONA`, `FORECAST_CONVICTION_PROMPT` — confirm no "you are
  structurally bullish" instruction, no per-theme CAGR floor the model must
  clear, and that sector lenses stay phrased as questions.
- **No unexplained market slang, in reader copy or in prompts sent to the
  model.** Grep for sleeve, marks, tape, conviction (outside "Thesis"),
  digestion, dry powder, beta, risk-on, drawdown, rotation.
  `MARGUS_PERSONA`'s ban list and `humanizeMargusText`'s scrub are the two
  enforcement points; a new prompt or a new card copy needs both.
  **One exception, and it is narrow.** `alsoCalled` on a glossary entry
  (`src/lib/glossary.ts`) may name the word the rest of the world uses,
  rendered only as "Elsewhere you will see this called X" by
  `outsideWordLine` and shown only through `Explain`
  (`src/components/ui/Explain.tsx`), which a reader has to open. The ban
  was costing something real: a person who learns the idea here and then
  opens their own broker meets the word with nothing connecting the two.
  Check that the plain phrase still carries the whole meaning with the
  clause deleted, which `glossary.test.ts` asserts by refusing an entry
  whose definition needs its own outside word, and that no heading, label,
  badge, button, chart axis, alert or letter has picked one up.
- **Every model-touched surface carries a working `WhyThis`.** Six
  sections in order: who made it, which model, what it was given, where
  those inputs came from, how the number was worked out, what it cannot
  know. `provenance.test.ts` fails if any surface ships without inputs,
  sources, and blind spots, or if an arithmetic-only surface (Scenario, the
  Growth rate) stops denying a model out loud.
- **The model named in the panel is the model that actually answered.**
  `describeModelRun` returns `null` (hiding the section) rather than
  guessing when the run's provider/model was not recorded — check any new
  AI route stamps `provider`/`modelId` as the call lands, not from the head
  of the fallback chain.
- **`humanizeMargusText` and `stripAiDashes`/`scrubAiPhrases` run over
  every model output**, not just the screens that existed when they were
  written. New Margus-adjacent surfaces (a new chat tool, a new card) need
  to be wired through the same pass.
- **Not financial advice, and the disclaimer says so.** `ADVICE_DISCLAIMER_SHORT`
  present wherever Margus, Pulse, or Forecast describe a price; CTAs stay
  navigational, never an instruction to buy, sell, or hold.

## 6. Copy, naming, and rename discipline

- **Neither `sheet` nor `book` in anything a person or the model reads.**
  `src/lib/reader-copy.test.ts` walks every JSX text node under `src/` —
  this is a floor, not a ceiling; a label passed as a prop or built in a
  variable is not caught and needs a manual read. `humanizeMargusText`
  covers model output specifically.
- **No em or en dash anywhere reader-facing**, including prompt text sent
  to the model (the model copies punctuation it is shown).
  `src/lib/reader-copy.test.ts`'s `ALLOWED` list is an exception list of
  five files where the character is data, not copy — never add a sixth to
  make a failure go away; a stale entry (naming a file with no dash left)
  fails on its own.
- **`NO_VALUE` for every missing cell**, never a bare hyphen or a literal
  em dash typed at a call site. `critical-path.test.ts` asserts the
  constant.
- **24-hour clock everywhere.** Every hour a person reads goes through
  `formatDateTime` (`hourCycle: "h23"`); grep for a direct
  `toLocaleString`/`toLocaleTimeString` call with an hour component, or a
  passed `hour12`.
- **Money goes through `format.ts`, never a local grouping regex.**
  `groupMoneyInText` is the last pass over the Sunday letter's subject,
  preview, body, and every model-written string.
- **Old `?tab=` URLs still redirect, and the query is dropped rather than
  carried.** `src/lib/legacy-urls.ts` (`legacyRedirectPath`,
  `metaTabFromToken`) — `legacy-urls.test.ts` walks every token and fails
  if one has no redirect behind it. A new path needs an entry in
  `PRIVATE_NOINDEX_PATHS` in the same commit that creates it.
- **A portfolio is a portfolio in copy, and `portfell_*`/`Sheet`/localStorage
  keys stay as-is in code.** Re-read the rename bullet in `AGENTS.md` before
  touching either half — they are deliberately not the same decision.
- **A word a beginner would look up is explained from the glossary, never
  typed at the call site.** `InfoTip` takes free text, which is right for a
  sentence about one chart and wrong for a word: "what you paid" appears on
  the holdings table, in the drawer, in the forecast and in the letter, and
  four hand-typed answers to one question drift into four different
  answers. `Explain` reads `src/lib/glossary.ts` and carries the reader's
  own figures into the example. Add an entry rather than a sentence.
- **A promise about behaviour is pinned to the behaviour, not asserted as
  copy.** `src/lib/landing-claims.test.ts` is the pattern: it fails
  whichever side moves. The rule earned its place on a privacy claim, which
  is the kind a reader acts on immediately and irreversibly. The landing had
  told them a co-owner cannot see what they paid, and a co-owner can.

## 7. Layout, motion, and the visual system

- **Glass is a 2% white veil, never a tinted card fill.** `--glass-veil`,
  `--glass-contrast` (1.05, pivots on mid-grey, load-bearing against black
  lift), `--glass-blur` (6px, not 40 — past ~7px it mixes hues into mud).
  Grep any new top-level card for a flat opaque `bg-card`/`bg-muted`
  instead of `.glass`/`.glass-well`.
  `--ambient-cool` is chrome-only; a component reaching for it directly is
  a tell that the glow-through-cards design intent is being worked around
  rather than followed.
- **No empty leftover cells in hairline grids.** `Segmented`, `HairlineGrid`,
  `Scoreboard` divide their column count by their children
  (`src/lib/filled-grid.ts`); a hand-rolled `grid-cols-N` on a `gap-px
  bg-border` pattern paints every track, including ones with nothing in
  them.
- **A column never clips its own content, and a popover never exceeds the
  room it has.** `src/lib/fitment.test.ts` — every table cell is
  `whitespace-nowrap` with a `minmax(min-content, 1fr)` track floor, and
  `PopoverContent` is bounded by `--radix-popover-content-available-height`.
- **The root element declares no overflow.** `src/lib/root-overflow.test.ts`
  — `html` sets nothing (or every Floating UI menu, select, popover, and
  tooltip positions in document coordinates instead of viewport ones and
  opens off-screen while the page is scrolled); `body` keeps its
  `overflow-x: clip`.
- **A bottom-pinned notice measures the dock, never guesses its height.**
  `src/lib/bottom-notice.test.ts` — `.bottom-notice`/`.bottom-notice-corner`
  read `--dock-clearance` from `use-dock-pad.ts`'s actual measurement, not
  a `--dock-pad` fallback that silently assumes a dock is present.
- **Nothing `position: fixed` over moving content carries a
  `backdrop-filter`.** This produced 42 repainted frames on the landing
  page and would reproduce anywhere the pattern is copied (a new sticky
  banner, a new floating CTA). Re-check `PullToRefresh`'s ring specifically
  — it is fixed, and safe only because it carries no blur.
- **Dock motion stays on the compositor.** `dock-motion.test.ts` — the
  marker never goes back to `left`/`right` transitions (main-thread layout,
  stalls under a route change), the trailing edge of the stretch always
  lags the leading edge, panes never gain a transform-based scale that
  would oval the round ends, and none of it survives
  `prefers-reduced-motion` unmodified (the marker still moves; it arrives
  rather than travels).
- **Frame budget on the motion that does survive.** Re-measure at 4x/6x/10x
  CPU throttle after any change to `.dock-breathe`, the marker travel
  curve, or hover swell — the numbers in `AGENTS.md`'s dock bullets are the
  budget to stay under, not a one-time measurement.
- **The brand mark has one source and no baked-in corner radius on square
  icons.** `src/lib/brand/mark.ts` is the only facet table. The bump is no
  longer manual: every `?v=` imports `MARK_ASSET_VERSION`
  (`src/lib/brand/mark-version.ts`, the mark's source hash), `npm run
  icons` writes the hash it drew from into `public/icons/mark-source.json`,
  and `public/sw.js` embeds it in its cache name;
  `mark-version.test.ts` fails on a geometry change until all three agree,
  printing the value to paste.
- **Ambient dither stays signed and clipped.** `src/lib/ambient-dither.test.ts`
  — the two amplitude terms stay exact double/half of each other, and
  black-level lift stays at 0.000 (an unsigned or unclipped dither greys
  out the field this app is built on).

## 8. Mobile specifics

- **A control on the phone top bar costs 44px of somebody's portfolio
  name.** Before adding a second real icon button to that bar, measure a
  long portfolio name at 360/390/430px — the answer is nearly always
  `phoneMenuRows` (the overflow menu), not a new glyph.
- **The dock's cell count depends on data, never on the current route.**
  `src/lib/dock-stability.test.ts` — a width-determining prop wired to a
  route check resizes and re-centers the whole capsule mid-navigation.
- **Every forecast year is shown, on the card and in `YearRail`.**
  `src/lib/forecast-years.test.ts` fails on a hardcoded year or a second,
  narrower year list anywhere in the panel.
- **Touch targets are 44px, gated correctly.** `[data-slot="button"]`,
  inputs, selects — but never `.inline-edit` (fixed `h-10` rows) and never
  the checkbox/switch pseudo-element (would steal taps from adjacent rows).
- **Form scrollers are `.scroll-host`, never a raw `overflow-y-auto`.**
  `scroll-host.test.ts` — do not gate the clearance padding on
  `@supports selector(::-webkit-scrollbar)` (Firefox answers true without
  implementing thumb styling).
- **Pull-to-refresh only refetches the room on screen.**
  `pull-to-refresh.test.ts` — `requestWorkspaceRefresh` gates on
  `isWorkspaceRoomActive`; a room with nothing to refetch answers
  `handled: false` and falls back to a router refresh rather than a
  ring that spins and does nothing.

## 9. Email

- **The Sunday letter is the only scheduled email**, and it always sends
  even when the model is down (`fallbackWeeklyTake`). Re-check no weekday
  "morning" or after-close note has been reintroduced.
- **Nobody is mailed twice, and identity does not depend on recognizing
  the caller.** `requestIsScheduledCron` (documented header first, not the
  undocumented one Vercel doesn't guarantee), `claimRecipient` (claimed
  before the letter is written, released on send failure), and a Resend
  `idempotencyKey` of `sunday-letter:<week>:<email>` — all three are
  independent guards; `weekly-letter-duplicates.test.ts` and
  `weekly-letter-batching.test.ts`.
- **The unsubscribe link works with no session and does the right thing
  on GET vs POST.** `unsubscribeUrlFor` (HMAC, no expiry) —
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` only ever accompanies
  a signed link; GET renders a button and changes nothing (mail scanners
  fetch every URL); POST turns off `note_sunday` for every profile sharing
  that mailbox. `unsubscribe-link.test.ts`.
- **No em/en dash and correct separators in the rendered email specifically**,
  not just the app — Gmail's snippet rebuild strips commas inside numbers,
  which is why `weeklyPreview` leads with the percent, not the dollar
  figure. `weekly-letter-format.test.ts`.
- **A thin-data letter does not send.** See §1's `weeklyNumbersAreSound`
  entry — worth re-checking here too since it is the single biggest
  reputational risk in the app (a confident, wrong number in an inbox).
- **Email colors track the site's tokens.** `EMAIL` in `src/lib/email-letter.ts`
  — if a token in `globals.css` moves, re-convert to hex rather than
  eyeballing a new value.

## 10. Backups, recovery, and migrations

- **Nightly snapshot and disaster-recovery crons actually run to
  completion**, not just "the cron fired." `captureBookPayload` — confirm
  it still uses `readAll` with no id filters and `"throw"` semantics (a
  paged read that silently drops rows is worse than an outright failure
  here). `docs/DISASTER_RECOVERY.md` for the full runbook; `dr/*.test.ts`
  for the pieces (checksum, encryption, WAL backups, retention, restore
  rehearsal).
- **Restore has actually been rehearsed recently**, not just tested in
  unit form. `dr/restore-rehearsal.test.ts` exercises the mechanism; a
  periodic real restore against a scratch project is the thing that test
  cannot substitute for.
- **Zero-downtime migration discipline.** `docs/ZERO_DOWNTIME_MIGRATIONS.md`,
  `scripts/migrate-online.ts` — a migration that locks a hot table or
  isn't backward-compatible with the currently-deployed code for the
  duration of the rollout is the kind of thing that only shows up under
  real traffic.
- **A shallow clone lies about reachability.** Before concluding a commit
  is unreachable, force-pushed over, or missing from `main`, run `git
  rev-parse --is-shallow-repository`; if true, `git fetch --unshallow`
  before trusting any `merge-base` or `log a..b` answer. This is not a
  one-time fact, it is a check to run every time the question comes up in
  a fresh session.

## 11. Concurrency

- **Read what landed under your branch before merging, not just the
  conflict status.** A clean three-way merge is exactly what two sessions
  building the same feature in different files produces, and it is the
  case that hurts (the split-handling collision recorded in `AGENTS.md`).
  Skim `git log main..HEAD` and `git log HEAD..main` for overlapping
  concern areas before trusting a green merge.
- **`bench:concurrency`'s in-process sim actually runs in CI**, and the
  live leg gets run locally with real credentials periodically — a lost
  update or a reverse lock order is exactly what this catches and exactly
  what a code read misses.

## 12. Accessibility

- **Every icon-only control keeps a visible label or `aria-label`.**
  Verified in the dock rework (title attributes removed where they only
  restated a visible label, kept where they teach an interaction — e.g.
  "right-click to rename or delete" on a portfolio cell). Re-check this
  balance on any new icon-only control.
- **Heading levels track a real scale**, not a size class chosen for
  looks. `src/lib/heading-scale.test.ts`.
- **Motion respects `prefers-reduced-motion`** everywhere the dock, the
  pull-to-refresh ring, or any new animated surface adds motion; confirm
  the state changes still happen (a marker under reduced motion arrives,
  it does not freeze).
- **The general scan runs in CI now**: the landing smoke drives axe-core
  (WCAG A + AA) over the whole signed-out surface — the landing at both
  viewports, `/privacy` and `/terms` — failing on serious or critical
  violations. Signed-in surfaces still rely on the hand-picked suites, so
  a new signed-in control keeps needing the manual pass above.

## 13. Security

- Run the `security-review` skill against the current diff before any PR
  touching auth, payments, or a new mutation route.
- **Secrets never reach a CI-visible env or a client bundle.**
  `scripts/check-ci-env.ts` (runs in the `build` CI job) rejects a secret
  name set in the public-only CI environment; re-run it manually after
  adding any new `NEXT_PUBLIC_*` variable.
- **`npm audit --omit=dev --audit-level=high` stays at zero** — a moderate
  or dev-only finding is worth reading but not worth blocking on; a
  high/critical production one blocks the merge and CI already enforces
  this. Read the findings CI surfaces rather than only checking the job is
  green.

---

## Improvement opportunities

Gaps found while assembling the checklist above, not bugs — things nothing
currently catches, or manual steps a future session could plausibly forget.
Ordered roughly by how much a miss would cost.

Status, 2026-08-30: the PR that followed this checklist (#175) implemented
the list — each item below carries a note saying what landed and, where a
human's hands are still needed, what remains. The reasoning above each
note is kept as written: it is why the mechanism exists.

1. **A cron that stops firing is invisible.** Every scheduling guarantee in
   §4 and §9 (claim tables, idempotency keys, `weeklyNumbersAreSound`)
   protects against a cron firing *twice* or firing with *bad data*.
   Nothing protects against Vercel's scheduler silently not firing at all —
   there is no dead-man's-switch ping (e.g. a Healthchecks.io-style call at
   the top of each cron route) and no alert if `disaster-recovery`,
   `snapshot`, or `splits` goes a day without a successful run. A missed
   split day is the one failure mode `AGENTS.md` spends a whole paragraph
   on the cost of, and there is currently no way to learn about it except a
   reader noticing their holdings look wrong.

   Landed: every cron route exports through `cronRoute` (`src/lib/cron-heartbeat.ts`), which pings a dead-man's-switch per run; `cron-heartbeat.test.ts` fails on an unwrapped route or vercel.json drift. Setup in `docs/CRON_MONITORING.md`, and `npm run cron:checks` creates the nine checks from `vercel.json` so no schedule is ever typed twice; `cron-checks.test.ts` fails if a cron has no grace, if a grace stops clearing its route's `maxDuration`, or if the runbook's table drifts from either. **Live since 2026-09-02**: the Healthchecks project exists with an email alert channel, all nine checks are created against their own schedules in UTC, and `CRON_HEARTBEAT_BASE` is set in Vercel's production environment as a secret. The checks were entered by hand that first time rather than through `npm run cron:checks`, which changes nothing about them: the script upserts on the slug, so running it later updates those same nine in place rather than making a second set.

2. **Cron and route failures have no aggregated visibility.** The stack has
   `@vercel/analytics` and `@vercel/speed-insights` (traffic and web
   vitals) but nothing that captures and aggregates server-side exceptions
   (no Sentry or equivalent). `dbError` and friends log to Vercel's own log
   stream, which is searchable but not alerted on. A structured error
   sink with even a minimal "email/Slack on new error class" rule would
   catch a regression in hours instead of whenever someone reads the logs
   or a support email arrives.

   Landed as the daily error digest (`src/lib/error-digest.ts`, `/api/cron/error-digest`): new error classes and volume jumps mail the operator, a quiet day sends nothing, and `error-log-reach.test.ts` keeps every human-summoning alarm writing the row the digest reads. Deliberately not a Sentry: no new provider.

3. **The brand mark's cache-busting is a manual discipline, and the note
   admits it.** `AGENTS.md`: "run `npm run icons` and bump every `?v=`
   ... plus `CACHE` in `public/sw.js`" is four separate hand edits after
   any facet-table change, with nothing that fails if one is missed. A
   small test (in the spirit of `reader-copy.test.ts`'s self-checking
   `ALLOWED` list) that reads `mark.ts`'s content hash and asserts it
   appears in every `?v=` site and in `public/sw.js`'s `CACHE` constant
   would turn a step that is easy to forget into one that cannot be
   forgotten.

   Landed: see the brand-mark entry in section 7 — one hash constant, a generated receipt, and `mark-version.test.ts` printing the value to paste.

4. **Screenshot import has no regression fixture set.** `MVP_AUDIT_LIVE_PASS.md`
   flagged broker-screenshot parsing as "still not reachable" in that pass,
   and nothing since has closed the gap with fixtures. This is the primary
   onboarding path for anyone without a CSV, so a small library of
   redacted sample screenshots from a handful of real broker apps (even
   two or three — Robinhood- and Schwab-shaped layouts differ a lot) run
   through the parser in CI would catch a regression before a real user's
   first import silently mis-reads their holdings.

   Landed at the deterministic seam: `src/lib/ai/screenshot-import.test.ts` pins the layer the vision model hands off to (implied cost, FX, skip rows, dedupe, ISIN suffixing) with broker-shaped tool calls. The model's own reading stays out of CI on purpose.

5. **No automated accessibility scan.** `heading-scale.test.ts` and
   `reader-copy.test.ts` catch specific, hand-picked rules, but nothing
   runs a general scan (axe-core via Playwright, reusing the Chromium
   already installed for `test:landing`) against the signed-out routes and
   a couple of representative signed-in ones. Cheap to add given the
   landing-smoke harness already exists; would catch contrast, label, and
   landmark regressions the hand-picked tests were never written to find.

   Landed: see section 12 — axe-core over the whole signed-out surface in the landing smoke.

6. **No visual regression harness for the pixel-measured design work.**
   A large share of the dock, glass, and dither work in `AGENTS.md` was
   validated by one-time pixel measurement against a recording or a live
   screenshot (`scripts/screenshot.mjs` exists for capture, but nothing
   diffs a captured screenshot against a baseline in CI). A small
   Playwright-screenshot-diff job on 3-4 key surfaces (the dock at rest and
   mid-travel, a glass card, the landing hero) would catch a future change
   silently reverting one of these measured values without anyone reading
   the CSS closely enough to notice.

   Landed in the measured spirit: the landing smoke walks the rendered DOM for any `position: fixed` element carrying a `backdrop-filter`, which is the fault class the pixel measurements caught. A screenshot-diff baseline harness was considered and deliberately not built: baseline diffs are the flaky kind of red.

7. **Account-deletion completeness is unverified.** The GDPR export path
   (`src/lib/gdpr/user-export.ts`) is paged and tested for completeness,
   but there is no equivalent for account *deletion* — a test asserting
   every `portfell_*` table with a user-owned row is actually empty after
   a deletion request, mirroring how `complete-reads.test.ts` walks call
   sites for `readAll` usage. A table added later and left out of the
   deletion path fails silently in the best-case (an orphaned row) and as
   a compliance gap in the worst case.

   Landed: `supabase/tests/account-deletion.test.sql` asks the catalog (FK delete rules, keyless identity columns purged or allowlisted with reasons) and then deletes seeded people through both doors and sweeps every identity column. It found a real gap on arrival — a pending email sign-in link outliving its account — fixed in migration `20260830130000`.

8. **Fund-run claim backlog has no staleness alarm.** `portfell_claim_fund_run`
   deliberately allows a claim older than its window to be retaken, which
   is the right design for recovering from a dead worker — but nothing
   currently reports if a claim keeps failing to complete (the backlog
   never catches up across several days). A simple "oldest unresolved
   claim age" metric surfaced somewhere would turn a silent multi-day
   backlog into a page.

   Landed: `fund_cron_backlog_stale` writes an error-log row once the missed-day list reaches three trading days, so /admin and the digest see it the day it happens; the run's response already carried `stillBehind`.

9. **`sunday_letter_skipped_untrusted` is a log line, not a metric.** A
   systematic data-quality regression (a stale-quote bug, a provider
   outage during the Sunday cron window) would show up today only as an
   unusually high skip rate buried in logs, or as a reader eventually
   asking why their letter stopped arriving. Counting and surfacing the
   weekly skip rate would catch the regression the same week it starts
   rather than whenever someone goes looking.

   Landed: the dispatch counts `untrusted` apart from ordinary skips and returns it, and a quarter of a run refused (on two or more people) writes an error-log row (`sunday_letter_untrusted_rate`); smaller rates stay a warning event.

10. **Load behavior under classroom-scale concurrent use is untested.**
    The session-keyed rate limiter fix (§ live-pass history: IP-keyed
    limits punishing a whole school network) was found by hand, once. There
    is no repeatable load test simulating N concurrent signed-in sessions
    polling quotes together, so a future regression in the limiter or the
    market fan-out (`src/lib/market/fanout.ts`) would need to be
    rediscovered the same way — by a real classroom hitting it.

   Landed in-process: `rate-limit-bucket.test.ts` already held the limiter half, and `classroom-herd.test.ts` counts provider batches for the single-flight now in `fetchQuotesWithFallback` (one class arriving together costs one walk). A live multi-instance load run stays a deliberate manual exercise, the same split `bench:concurrency` makes.

11. **No documented secret-rotation cadence.** `docs/DISASTER_RECOVERY.md`
    covers backup and restore; nothing parallel documents how or how often
    `UNSUBSCRIBE_SECRET`, the Supabase service-role key, provider API keys,
    or `SUPABASE_SERVICE_ROLE_KEY` itself get rotated, or what breaks (and
    for how long) during a rotation. Worth a short runbook even if the
    current answer is "rotate manually, here is the order that avoids
    downtime."

   Landed: `docs/SECRET_ROTATION.md`, including the two rotations with teeth (the unsubscribe link silently signs with the service-role key when `UNSUBSCRIBE_SECRET` is unset, and a rotated `SNAPSHOT_ENCRYPTION_KEY` cannot open old cold copies).

12. **Household-circle and classroom edge cases (mid-year teacher removal,
    a class archived while `class_plan` has an open buy period, a household
    pair partially unlinking) don't have obvious dedicated test coverage**
    the way the steady-state opt-in rules do. Worth a pass specifically
    through the state-transition cases rather than the create/join cases
    that are already well covered.

   Landed: `supabase/tests/household-classroom.test.sql` (mirroring, partial unlink, classrooms never mirror, the last-admin guard and its promote-first remedy, a class deleted mid-term freeing student work) and `src/lib/classroom-plan.test.ts` (exact period boundaries, overlaps, mid-period flips).

13. **No periodic real restore rehearsal recorded.** `dr/restore-rehearsal.test.ts`
    exercises the mechanism in unit form; `docs/DISASTER_RECOVERY.md` should
    (if it does not already) carry a dated log of the last time a real
    restore was performed against a scratch Supabase project, the way
    `MVP_AUDIT_LIVE_PASS.md` logs live-app passes — a mechanism that has
    only ever been unit-tested is unverified in the one way that matters.

   The log landed in `docs/DISASTER_RECOVERY.md` with its first row honestly empty; the first real rehearsal against a scratch project still needs a human with production DR credentials to run it and write the row.

