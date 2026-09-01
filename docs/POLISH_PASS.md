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

- [ ] Snapshot restore lets a signed-in reader restore another account's portfolio by name (`restore_sheet`). Verify and close.
- [ ] `/api/book/ytd-from-image` computes the 401 and throws it away.
- [ ] Chat `ccContext` and `messages` reach the system prompt unshaped.
- [ ] Holdings import skips the money and share ceilings the single-holding route enforces.
- [ ] CSP `'unsafe-inline'` on scripts: measure a report-only nonce policy.
- [ ] Unsubscribe matches email with `ilike` (LIKE wildcards).
- [ ] `/auth/link` acts on GET (mail scanners confirm an address).
- [ ] Raw error strings in three responses.
- [ ] `/api/trends` on the per-instance limiter only.
- [ ] Circle invite tokens stored in plaintext beside their hash.
- [ ] Unshaped `conviction` and `forecast.rows` bodies; a malformed row is a 500.
- [ ] `/api/book/nav-history` serves anonymous callers.
- [ ] Second-pass finders: authorization and IDOR; input validation and injection; auth flows, cookies and crypto; abuse and rate limits; supply chain (`npm audit`, lockfile).

## 2. Performance, caching, page speed

- [ ] Two remote auth round trips per API call (proxy plus route handler).
- [ ] `GET /api/portfolios` writes on every read and is polled every 45 seconds.
- [ ] `/api/upside-portfolio` recomputed per viewer.
- [ ] Client fetch dedupe for quotes, fear and greed, portfolios, experience tier, market events.
- [ ] Redundant FX-only quote poll.
- [ ] `cache: "no-store"` on CDN-public routes.
- [ ] Two 1 Hz timers re-rendering rooms; fund freshness ticking while hidden.
- [ ] Fear and greed refetched on every macro tick.
- [ ] `radix-ui` barrel not in `optimizePackageImports`.
- [ ] Margus chat chunk warmed by a different `import()` than the one that renders it.
- [ ] `OverviewDashboard` memo defeated by two inline callbacks.
- [ ] Options scan on the book's critical path.
- [ ] Service worker offline fallback on a shared device.
- [ ] Second-pass finders: server latency, client waterfalls and polling, bundle and render cost, CDN and browser caching, measured before and after.

## 3. Copy, voice, accuracy

- [ ] Eight sentences that are instructions to buy, sell or hold, on the covered-call surfaces, the Pulse schema and the Sunday letter.
- [ ] Jargon without a plain gloss (ROI, P&L, equity, strike, yield, allocation, benchmark, presidential cycle, leverage multiple).
- [ ] The growth planner's default rate can be 27 to 37 percent a year, compounded for fifty years, with the caveat behind a click.
- [ ] Presets named by a number and nothing else.
- [ ] One name for the Sunday letter, one name for a circle, companies rather than "names".
- [ ] Walls: the walkthrough's 62-word opening sentence, the terms' 200-word payment paragraph.
- [ ] Empty states and error messages that do not say what to do next.
- [ ] Every historical or market claim checked for accuracy.
- [ ] Second-pass finders per screen, plus a claims checker with web verification.

## 4. Margus

- [ ] Persona: "risk reference point", the borrowing ceiling that reads as a rule.
- [ ] The scrubber misses the bare form of most banned words; openers only caught at the start of a paragraph.
- [ ] The covered-call prompt tells the model to give execution timing and uses the words the persona bans.
- [ ] Tool descriptions say "cost basis" and "books".
- [ ] Response speed: streaming, first-token time, chunk warm.
- [ ] Openers, empty portfolio behaviour, what he can and cannot write.
- [ ] Second-pass: an adversarial reader tries to make Margus give advice, use slang, or invent a number.

## 5. Onboarding

- [ ] The walkthrough is eleven screens of cards with two or three sentences each. Rebuild the telling screens as interactive: a live sample day the reader can tap through, a working miniature of the bar, questions that show their effect.
- [ ] The map omits Upside Fund and Margus; "a minute" on one screen and "two minutes" on another.
- [ ] Holdings entry: screenshot, CSV, paste and typing all reachable from the first screen that asks.
- [ ] Empty Home reads as a wall.

## 6. Learning layer (the gap)

- [ ] There is no glossary, no lesson, no quiz, no "why did this move" explainer beyond Pulse and Margus. Design a learning layer that is short, in context, and earned by looking at your own portfolio rather than a course.
- [ ] Ideas to critique: plain-word glossary on tap for every term; one-minute reads triggered by what happened in your portfolio today; a paper portfolio to practise with; a weekly reflection; streaks that reward looking rather than trading; a "what would you have to believe" prompt per holding.
- [ ] Judge panel on the ideas, then build the ones that survive.

## 7. Community (Circle)

- [ ] What a circle does today: today board, shared holdings, league, members, daily duel, superlatives, power animals.
- [ ] Ideas to critique: shared watchlist, a weekly circle letter, "explain this to me" requests, predictions with a scoreboard, reading a member's thesis.
- [ ] Judge panel, then build.

## 8. UI and UX per screen

- [ ] Landing, Home, Portfolio, Pulse, Lab (mix, risk, trends, seasonality), Growth, Alerts, Circle list, Circle, Account, Upside Fund, Margus, every modal. Each judged on hierarchy, breathing room, purposeful placement, dead UI, mobile and laptop parity, empty, loading and error states.
- [ ] Interactive and animated elements where they teach something (a number counting to its value, a bar growing to its share, a path drawing itself).
- [ ] Accessibility: keyboard, focus, labels, contrast, reduced motion, axe on every room.

## 9. Integrations, links, consistency

- [ ] Dead pages: `/dashboard`, `/forecast`, `/margus` deep link paints Home, `/api/user/export` orphan, `activeMobileTab` dead.
- [ ] `/auth/*` missing from the noindex list.
- [ ] Circle room titled "Communities" in metadata and Admin.
- [ ] Forecast described as a room in three places.
- [ ] README's room list.

## 10. Documentation and rules

- [ ] Read every rule in `AGENTS.md`, `DESIGN_TOKENS.md` and `docs/` against the goal. Loosen the ones that cost more than they protect, correct the ones that are wrong, and record why.

## 11. Bloat and removal

- [ ] Unused exports, unreachable routes, unused dependencies, features nobody can reach.

## 12. Tests and CI

- [ ] A test per fix above. Invariants suite still green. CI runtime.

## 13. Merge and the live pass

- [ ] Merge to `main`.
- [ ] Walk the production build room by room, phone and laptop, and record what it found in `docs/MVP_AUDIT_LIVE_PASS.md`.
