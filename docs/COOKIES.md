# Cookies and on-device storage

What Upside Lab actually stores in a visitor's browser, so the answer
exists when a regulator, an enterprise customer, or a curious user asks.

This is an internal reference, not the published notice. The Privacy
Policy (`src/app/privacy/page.tsx` §6) describes these at category level,
which is what most DPAs accept for an app this size. If a per-cookie
table ever needs publishing, build it from here rather than from memory.

**Last verified: 2026-08-27**, by walking every `upside-` / `portfell-` key
in `src`. The signed-out cookie dump (zero cookies before and after Allow)
was 2026-08-19 and still matches: this app still sets none of its own.

## The headline: this app sets almost no cookies

The verified result on a signed-out visit was **zero cookies** — before
answering the consent banner, and still zero after clicking Allow.
Everything the app keeps on a device is `localStorage`.

That matters for two reasons. It means the usual "we use cookies for
analytics" boilerplate would be inaccurate here. And it means the
ePrivacy question is really about **storage**, not cookies specifically:
Article 5(3) covers "storing information, or gaining access to
information already stored, in the terminal equipment of a subscriber"
— `localStorage` included. The exemption test is the same either way
(strictly necessary for a service the user requested), and the keys below
are functional app state rather than tracking.

## Cookies

| Name | Set by | Purpose | Lifetime | Consent |
|---|---|---|---|---|
| `sb-uzrnybyggznpvgxgrvgl-auth-token` (may be split into `…-auth-token.0`, `…-auth-token.1` when the JWT is large) | `@supabase/ssr`, first-party, on our domain | The signed-in session. Without it you are signed out on every request. | Tracks the Supabase session/refresh-token lifetime; cleared on sign-out and by account deletion (`purgeClientSession()`). | **Strictly necessary** — exempt. No banner required. |
| Google sign-in cookies | Google, on `google.com` / `accounts.google.com` | Google's own sign-in. | Google's, not ours. | Set by Google under Google's policies during the OAuth redirect. We never read them and they are not on our domain. |

The name above is the `@supabase/ssr` convention
(`sb-<project-ref>-auth-token`) applied to this app's project ref, derived
from the naming convention rather than independently observed in a
sandbox with no reachable Supabase project. Not a to-do: this file is an
internal reference, not the published Privacy Policy, and Martin has
confirmed a per-cookie table isn't being published — the policy stays at
category level (§6), which is what regulators expect for an app this
size. If that ever changes, re-derive this from a real signed-in session
rather than trust the name as-is.

## Vercel Analytics and Speed Insights

`@vercel/analytics` and `@vercel/speed-insights` are **cookieless** — they
set no cookies, which the empirical check confirms (zero cookies even
after consent was granted).

They are still gated behind an explicit opt-in banner
(`AnalyticsConsentBanner.tsx` → `ConsentedAnalytics.tsx`), and they only
mount once `loadAnalyticsConsent() === "allow"`. That is stricter than
ePrivacy strictly requires for a cookieless measurement tool, and it is
the right default to keep: it means no third-party measurement script
runs at all for anyone who declines.

The choice itself is stored in `upside-analytics-consent-v1`.

## localStorage

Every key is first-party, readable only by our own origin, and never sent
to a server automatically the way a cookie is. None of it profiles a
person across sites.

Categories rather than one row per key, since the list churns with
features. **What actually bounds this is the naming rule, not the list:**
every key the app writes starts `upside-` or `portfell-`, and Supabase's
starts `sb-`. Those three prefixes are what the sign-out sweep matches, so
a key that is not one of them is a bug rather than an undisclosed store.

For a starting point when auditing:

```bash
grep -rhoE '"(upside|portfell)[-_][A-Za-z0-9._-]+"' src | sort -u
```

That is a superset — it also catches event names and table names that
follow the same convention — so read the hits, do not count them.

*(This block used to publish `grep -rhoE '"(upside|portfell)-[a-z0-9-]+"'
src/lib src/components` and call it authoritative. It was neither: it
searched two directories rather than all of `src`, and its character class
dropped every key containing an underscore or a dot. The table below was
built against that command and listed about a third of what the app
stores.)*

| Category | Examples | What it is |
|---|---|---|
| Consent | `upside-analytics-consent-v1` | The analytics answer itself. Must persist, or the banner cannot stop asking. |
| Session-adjacent | `upside-last-user-v1`, `upside-active-sheet-id`, `upside-last-portfolio-id`, `upside-last-circle-id`, `upside-open-tab` | Which account/portfolio/tab you were last on, so the app reopens where you left it. Margus uses last-opened when you are on Home. |
| Offline + sync queue | `upside-offline`, `upside-sync`, `upside-flush-sync`, `upside-book-cache-v1`, `upside-quotes-v1` | The offline-first engine: the cached portfolio and the queue of writes waiting for a connection. |
| Your own working notes | `upside-conviction-v1`, `upside-watchlist-v1`, `upside-week-marks-v1`, `upside-pulse-history-v1`, `portfell-trends-watchlist` | Thesis notes and watchlist. Also synced server-side per owner (`portfell_lab_state`). |
| Things you told us about yourself | `portfell-experience-tier`, `portfell-knows-options` | The two onboarding answers, which decide what the app shows you. Changeable in Account. |
| Your conversation with Margus | `portfell-chat-by-portfolio` | Chat history per portfolio, so a thread survives a reload. Cleared with the rest on sign-out. |
| View preferences | `upside-display-currency-v1`, `upside-compound-*`, `portfell-forecast-*`, `portfell-cc-visible-by-portfolio`, `upside-margus-wide`, `portfell-upside-portfolio-benchmark`, `upside-macro-paint-v1`, `upside-sentiment-paint-v1`, `upside-trends-paint-v1:`, `upside-seasonality-paint-v1:` | Toggles and per-portfolio view state. |
| Numbers you set | `portfell-ytd-anchor-v1`, `portfell-nav-assumed-ytd`, `portfell-nav-history-v1`, `upside-compound-milestone-actuals-v1` | Year-start anchors and planner inputs you typed. |
| Read / dismissed markers | `upside-alerts-dismissed-v1`, `upside-invite-nudge-v1`, `upside-last-visit-v1`, `upside-last-visit-v2`, `upside-visit-streak-v1`, `portfell-sheet-imported-v1` | What you have already seen, so the app stops re-showing it. |
| Read-through caches | `upside-communities-list-v1`, `upside-communities-discover-v1`, `upside-fund-v1`, `upside-fund-compare-v1`, `upside-pulse-summary-v1`, `upside-pulse-ticker-v1:`, `upside-daily-duel-v2`, `upside-billing-status`, `upside-feedback-v1` | Copies of things the server already told us, so a page can paint before the network answers. Nothing here is the source of truth. |
| Demo / local dev | `portfell-demo-v8`, `portfell-locked` | The seeded demo portfolio and its Save lock. Local only. |

`purgeClientSession()` wipes this on sign-out and on account switch,
matching those same three prefixes plus IndexedDB and all of
`sessionStorage`. That is what stops one person's cached notes surfacing
under another account on a shared browser.

Three things are kept on purpose, and they are kept because wiping them
would be worse: `upside-analytics-consent-v1` (wiping it re-asks a question
the person already answered, which is not consent), `portfell-locked` (the
demo Save lock, which exists to be hard to lose), and `portfell-demo-v*`
(the seeded local demo portfolio). None of the three says anything about who
you are. Everything else goes.

## When to revisit

Re-run the verification and update this file when any of these change:

- A third-party script is added that is **not** cookieless — a marketing
  pixel, a heatmap tool, an A/B framework, a chat widget. That is the
  trigger for publishing a real per-cookie table in the Privacy Policy,
  and for a consent banner that blocks it before it loads.
- Supabase auth changes how it stores sessions.
- The app starts setting first-party cookies of its own.
