# The polish pass (September 2026)

A living checklist of everything being audited, fixed, built and re-checked
in the pass that started 2026-09-01. The brief: make Upside Lab something a
person who wants to learn investing keeps open every day, and something a
VC could not find a hole in. Every line here is either `[ ]` planned,
`[~]` in progress, `[x]` done, or `[-]` looked at and deliberately left
alone (with the reason).

The method is the one this repo already uses, at a bigger scale: read
everything, measure rather than eyeball, verify each finding adversarially
before acting on it, and write the reasoning down beside the change.

## 0. Method

- [x] Baseline: typecheck, lint, 1193 unit tests, all green on `main` at `96f4032`.
- [x] Every room screenshotted at 390x844 and 1280x800 in demo mode, seeded with a beginner's portfolio (phone and laptop, full page).
- [x] Four first-pass audits read every route, every reader-facing file, every fetch and poll: security, links and routes, reader copy and Margus, performance and caching.
- [~] Second pass at full depth: each dimension re-audited by several independent finders, every finding refuted by independent skeptics before it is acted on, a completeness critic asking what was missed.
- [ ] Every fix validated by the repo's own checks before it lands; every new behaviour gets a test that would have failed before the change.
- [ ] Merge to `main`, then a full audit pass against the live build.

## 1. Security

- [x] Snapshot restore lets a signed-in reader restore another account's portfolio by name (`restore_sheet`). Closed: a saved copy is matched only among the caller's own sheets, and a stranger's sheet answers 403 with no writes.
- [x] `/api/book/ytd-from-image` computes the 401 and throws it away. Closed, with the limiter keyed on the reader.
- [~] Chat `ccContext` and `messages` reach the system prompt unshaped.
- [~] Holdings import skips the money and share ceilings the single-holding route enforces.
- [ ] CSP `'unsafe-inline'` on scripts: measure a report-only nonce policy.
- [~] Unsubscribe matches email with `ilike` (LIKE wildcards).
- [~] `/auth/link` acts on GET (mail scanners confirm an address).
- [~] Raw error strings in three responses.
- [x] `/api/trends` on the per-instance limiter only. Now the durable limiter, per reader.
- [~] Circle invite tokens stored in plaintext beside their hash.
- [~] Unshaped `conviction` and `forecast.rows` bodies; a malformed row is a 500.
- [x] `/api/book/nav-history` serves anonymous callers. Requires a session now.
- [~] Second-pass finders: authorization and IDOR; input validation and injection; auth flows, cookies and crypto; abuse and rate limits; supply chain (`npm audit`, lockfile).

## 2. Performance, caching, page speed

- [~] Two remote auth round trips per API call (proxy plus route handler).
- [x] `GET /api/portfolios` writes on every read and is polled every 45 seconds. The ensure step moved to the session's first `/api/auth/me`; the poll is a read.
- [~] `/api/upside-portfolio` recomputed per viewer.
- [~] Client fetch dedupe for quotes, fear and greed, portfolios, experience tier, market events.
- [~] Redundant FX-only quote poll.
- [ ] `cache: "no-store"` on CDN-public routes.
- [~] Two 1 Hz timers re-rendering rooms; fund freshness ticking while hidden.
- [~] Fear and greed refetched on every macro tick.
- [~] `radix-ui` barrel not in `optimizePackageImports`.
- [~] Margus chat chunk warmed by a different `import()` than the one that renders it.
- [~] `OverviewDashboard` memo defeated by two inline callbacks.
- [ ] Options scan on the book's critical path.
- [ ] Service worker offline fallback on a shared device.
- [~] Second-pass finders: server latency, client waterfalls and polling, bundle and render cost, CDN and browser caching, measured before and after.

## 3. Copy, voice, accuracy

- [ ] Eight sentences that are instructions to buy, sell or hold, on the covered-call surfaces, the Pulse schema and the Sunday letter.
- [ ] Jargon without a plain gloss (ROI, P&L, equity, strike, yield, allocation, benchmark, presidential cycle, leverage multiple).
- [ ] The growth planner's default rate can be 27 to 37 percent a year, compounded for fifty years, with the caveat behind a click.
- [ ] Presets named by a number and nothing else.
- [ ] One name for the Sunday letter, one name for a circle, companies rather than "names".
- [ ] Walls: the walkthrough's 62-word opening sentence, the terms' 200-word payment paragraph.
- [ ] Empty states and error messages that do not say what to do next.
- [ ] Every historical or market claim checked for accuracy.
- [~] Second-pass finders per screen, plus a claims checker with web verification.

## 4. Margus

- [ ] Persona: "risk reference point", the borrowing ceiling that reads as a rule.
- [ ] The scrubber misses the bare form of most banned words; openers only caught at the start of a paragraph.
- [ ] The covered-call prompt tells the model to give execution timing and uses the words the persona bans.
- [ ] Tool descriptions say "cost basis" and "books".
- [ ] Response speed: streaming, first-token time, chunk warm.
- [ ] Openers, empty portfolio behaviour, what he can and cannot write.
- [~] Second-pass: an adversarial reader tries to make Margus give advice, use slang, or invent a number.

## 5. Onboarding

- [ ] The walkthrough is eleven screens of cards with two or three sentences each. Rebuild the telling screens as interactive: a live sample day the reader can tap through, a working miniature of the bar, questions that show their effect.
- [ ] The map omits Upside Fund and Margus; "a minute" on one screen and "two minutes" on another.
- [ ] Holdings entry: screenshot, CSV, paste and typing all reachable from the first screen that asks.
- [ ] Empty Home reads as a wall.

## 6. Learning layer (the gap)

- [ ] There is no glossary, no lesson, no quiz, no "why did this move" explainer beyond Pulse and Margus. Design a learning layer that is short, in context, and earned by looking at your own portfolio rather than a course.
- [ ] Ideas to critique: plain-word glossary on tap for every term; one-minute reads triggered by what happened in your portfolio today; a paper portfolio to practise with; a weekly reflection; streaks that reward looking rather than trading; a "what would you have to believe" prompt per holding.
- [~] Judge panel on the ideas, then build the ones that survive.

## 7. Community (Circle)

- [ ] What a circle does today: today board, shared holdings, league, members, daily duel, superlatives, power animals.
- [ ] Ideas to critique: shared watchlist, a weekly circle letter, "explain this to me" requests, predictions with a scoreboard, reading a member's thesis.
- [~] Judge panel, then build.

## 8. UI and UX per screen

- [~] Landing, Home, Portfolio, Pulse, Lab (mix, risk, trends, seasonality), Growth, Alerts, Circle list, Circle, Account, Upside Fund, Margus, every modal. Each judged on hierarchy, breathing room, purposeful placement, dead UI, mobile and laptop parity, empty, loading and error states.
- [ ] Interactive and animated elements where they teach something (a number counting to its value, a bar growing to its share, a path drawing itself).
- [~] Accessibility: keyboard, focus, labels, contrast, reduced motion, axe on every room.

## 9. Integrations, links, consistency

- [x] Dead pages: `/dashboard`, `/forecast`, `/margus` deep link paints Home, `/api/user/export` orphan, `activeMobileTab` dead. Two pages and the orphan route deleted; `/margus` opens Margus over Home and closes back to `/`.
- [x] `/auth/*` missing from the noindex list.
- [x] Circle room titled "Communities" in metadata and Admin.
- [~] Forecast described as a room in three places.
- [~] README's room list.

## 10. Documentation and rules

- [~] Read every rule in `AGENTS.md`, `DESIGN_TOKENS.md` and `docs/` against the goal. Loosen the ones that cost more than they protect, correct the ones that are wrong, and record why.

## 11. Bloat and removal

- [~] Unused exports, unreachable routes, unused dependencies, features nobody can reach.

## 12. Tests and CI

- [~] A test per fix above. Invariants suite still green. CI runtime.

## 13. Merge and the live pass

- [ ] Merge to `main`.
- [ ] Walk the production build room by room, phone and laptop, and record what it found in `docs/MVP_AUDIT_LIVE_PASS.md`.

## 14. Second pass: what the finders brought back

The second pass (six workflows, twenty-one finders that completed before
the session limit, the rest re-run afterwards) produced 118 UX findings on
the first six screens, 83 on the rest, 51 security findings, 12 measured
performance findings, 156 copy and accuracy findings, and 79 feature ideas
scored by a panel. The digests live in the session scratchpad; the
findings that survive are tracked here as work packages, each built in its
own worktree with a test, reviewed adversarially, then merged.

### Security, second pass

- [~] A co-owner can remove the portfolio's creator and lock them out (the RLS fix closed only the direct path).
- [~] Linked-address confirmation can bind a stranger's future account to the requester (never-signed-up address, spent on GET).
- [~] A tab or newline in `next` survives `safeInternalPath` and becomes an open redirect after sign-in.
- [~] Session cookies set without `Secure`.
- [~] Rate-limit buckets keyed on an unverified cookie value.
- [~] Proxy matcher skips every path containing a dot, so dotted slugs get no CSP and no forged-request gate.
- [~] Junk symbols in one anonymous quote request cost thousands of provider calls before the budget is charged.
- [~] A ticker with a bracket, stored by import, crashes Pulse for every co-owner.
- [~] Call %, targets and sort order accept any finite number.
- [~] Account purge leaves a deleted person's holdings inside older saved copies.
- [~] An expired session skips the client purge, so the next account on the browser inherits notes and the sync queue.
- [~] Google fallback binds accounts by email string, not the provider's subject.
- [~] Any avatar URL works as a tracking pixel on every circle member.
- [~] Add-address endpoint tells any signed-in user whether an address has an account.
- [~] One-time tokens are spent without checking the row count.
- [~] The sign-in link page never names the address it opens and replaces an existing session silently.
- [ ] Forecast ticker cache: one reader's thesis text can steer every other reader's shared path for fourteen days.
- [ ] Pulse shared cache serves a caller-steered verdict to other readers for four hours.
- [ ] Classroom students can set their own paper cash and buy at any price.
- [ ] Invite mail with no rate limit and a caller-chosen subject.
- [ ] Circle invite tokens stored in plaintext (in flight from the first pass).
- [ ] Unsubscribe `ilike`, `/auth/link` on GET, raw error strings, holdings import bounds, unshaped chat and forecast bodies (in flight from the first pass).
- [-] `/api/internal/log-error` unauthenticated by design; text-only digest, log pollution only.

### Performance, second pass (measured)

- [x] Functions ran in Virginia against a Stockholm database: about 335 ms per read of transit. Pinned to `arn1`.
- [x] Every quote fetch made ten serial FX calls first; a 90-day chart per ticker on every poll; symbol resolution never memoised. Measured through a mocked provider, cold then the same hit 5s later: 1 name 12/12 to 12/1, 5 names 20/20 to 20/5, 15 names 40/40 to 40/15. Cold is unchanged on purpose; the saving is the repeat, which is what a polling reader actually does. Cold latency on 5 names 60.9ms to 42.4ms, which is the rates no longer standing in front of the wave.
- [x] nav-history transferred fourteen whole-product snapshots to read fourteen numbers. Measured against a fake PostgREST with a 2,000-holding payload: 8,655,949 bytes to a few hundred. The alias on the arrow select is load-bearing, since an unnamed one is named differently by different PostgREST versions and reading the wrong name draws an empty chart without raising.
- [x] `ensureProfileAndClaims` was five to seven serial round trips with an N+1 slug loop. Two waves now, and the merge kept the narrower avatar host guard the earlier pass added.
- [x] `/api/communities` was two serial reads on every Home load. One embedded select.
- [x] Proxy auth round trip, fund payload cache, `radix-ui` barrel. The barrel is a development win only: the production output is byte for byte identical, because Turbopack already tree-shakes it.
- [x] Deleting a holding on a normal portfolio paid a full Yahoo walk for a cash delta it then threw away; adding one was six serial round trips. Three now, and no provider walk at all on a portfolio that does not move cash on a trade.
- [ ] Opening a circle is four routes times three auth round trips plus four serial waves each.
- [ ] Margus waits for two rate-limit RPCs and a sixteen-ticker calendar before the first token.
- [ ] Account mounts four routes that each read the same profile row.
- [ ] Client fetch sharing, the FX-only poll, the 1 Hz timers, the Margus chunk loader (waiting on the Dashboard package).

### Screens (UX and copy together, one package per room)

- [~] Growth and Lab: honest default rate, presets named, chart that draws and can be scrubbed, Lab tabs that say what to notice, all jargon out.
- [~] Welcome tour: seven screens, each interactive (the red day you tap open, sort the rules, the bar you can press, two questions on a live Home, add what you own with something said back, pick one to watch, your first week).
- [~] Margus: prompts, scrubber, tier voice, teaching block, follow-up question.
- [~] Emails and legal: terms and privacy checked against the code, loading lines, error pages, invite and reminder mail.
- [ ] Home: hero that leads with the value, market card that answers "me or the market", one briefing card, no duplicate notices, honest chart caption, watchlist suggestions that are not three coins, "less than 1%" everywhere, status strip in words.
- [ ] Portfolio room: fractional shares, Gain instead of ROI, phone card with a lead figure, tap-to-open drawer, drawer that matches the row, totals up top, covered calls hidden below 100 shares, placeholder forecast drawn as a placeholder, modal copy.
- [ ] Pulse: the day's story first, the market's move beside yours, company names on cards, a real measured range, fallback cards that say so, headlines with source and age, no forced model call from Home.
- [x] Alerts: the lifecycle bug is fixed (two lists, and only a press on Dismiss writes the one the room reads), cards go where they are about rather than all to Overview, the empty state says what will fill it, and margin health reaches a screen now that the room is not permanently empty. Cards that teach with the reader's own numbers are still open.
- [ ] Circle: percent-only by default, a duel that resolves, reasons shared side by side, an empty circle that leads with the invite, what changed since you looked, a League that fits on a phone, one award per person, "circle" not "community".
- [ ] Account: identity first, sign out on the phone, supporter not Pro, a delete dialog built from data, an attention streak in a warm voice, the options question asked in plain words.
- [ ] Upside Fund: a not-advice line on the page, Bought and Sold instead of Opened and Exited, S&P 500 not SPY, honest risk cells.
- [ ] Landing and sign-in: one sample portfolio whose numbers add up, a Pulse still you can toggle, six sections not eight, a footer that says who is behind it, the consent question off the first screen, `/login` compact.
- [~] Learning layer. Built and tested: a normal day for you (`typical-move.ts`), cards that come back (`recall-deck.ts`), company or the whole market (`market-or-you.ts`), what you would have to believe (`believe.ts`), and the glossary. Teach me this word now has a surface (`Explain`, on the Fund). Still open: guess before you look, thesis check-in, draft your thesis with Margus, and the rest of the wiring, which the screens packages carry.
- [ ] Demo mode a stranger can open from the landing.

### Rules and documentation

- [x] `AGENTS.md` opens with what the product is for and how to read a file whose weight follows where the debugging went rather than what matters most. About a sixth of it is one navigation bar's motion, and nothing in it said what the app was for.
- [x] The slang ban is amended rather than kept or dropped. It was costing the reader the other half of their life: taught the idea, then unable to recognise it in their own broker's screens. One field in one module may name the outside word, and the test refuses an entry whose definition needs it.
- [x] Two migrations sharing the timestamp `20260902120000`, from two sessions in one hour.
- [ ] `TIER_HIDDEN_META_TABS` hides Lab from a novice, which is the analysis room withheld from exactly the reader the product is for. The answer is Lab with each tab saying what to notice, not Lab hidden, so this waits on the Lab content package.
- [ ] `TIER_HIDDEN_LAB_TABS` hides Risk until advanced. A shock test is one of the most teaching things in the app.
- [x] `docs/AUDIT_CHECKLIST.md` and `docs/MVP_AUDIT_LIVE_PASS.md` checked for staleness. Both are live and referenced; neither is bloat.

### Production errors, found from the live digest (2026-09-02)

- [x] `portfell_apply_cash_delta failed: boom`, three rows, mailed to the superadmin. A test fixture. `logError` builds its own client from the environment, and any machine that can run this app carries the production service-role key, so every `npx vitest run` wrote to the live error table, silently in both directions. Guarded at the one place a client is made, so the whole class goes rather than the one row.
- [x] `/navlag`, `_not-found` client reference manifest, three rows on 30 August. Checked against production directly: `/navlag` and a random path both 404 cleanly now. Transient, already gone, nothing to fix.
- [ ] The three fixture rows are still in `portfell_error_log` and are displacing real errors from the admin console's recent window. One button at `/admin`, and clearing resets the digest's comparison window by design. Left for Martin rather than reaching into production data.
