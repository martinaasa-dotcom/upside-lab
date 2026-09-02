# Upside Lab

Your whole portfolio, in plain words. And when it falls, what actually changed. Live prices, a plain read on every name you own, circles you share a portfolio with, and an open paper fund (Upside Fund).

Production: [https://upsidelab.app](https://upsidelab.app)  
Repository: [`martinaasa-dotcom/upside-lab`](https://github.com/martinaasa-dotcom/upside-lab), branch `main`

## Quick start

```bash
git clone https://github.com/martinaasa-dotcom/upside-lab.git
cd upside-lab
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase env vars it runs in local demo mode (`localStorage`).

## What you get

- **Home**: holdings, what you paid, today's move, whether the market or your own companies moved it, and an overnight line when the US market is shut
- **Pulse**: on a fall, whether news came out of the company or the whole market moved together. Largest names, plus anything down 5%
- **Lab**: where your money sits, what a rough week would do to it, weekly trends, seasonality. Every tab opens with a sentence in your own figures saying what to notice
- **Growth**: compounding planner seeded from what you actually hold
- **Margus**: chat that can read and edit the open portfolio (screenshot from a tap, or CSV)
- **Circle / Fund / Account**: Circle is the last dock cell (dotted member ring). Upside Fund and Account are side rooms, not extra home-screen heroes
- **Learning as you go**: what an ordinary day looks like for your own portfolio, so a red number means something; a plain-English glossary you can open from any word the app prints; what a price target is actually asking a company to do; one question a day about what you hold, on a spacing schedule
- **The Sunday letter**: one scheduled email a week, opt-in, written from Pulse verdicts you already saw and refused outright when the numbers behind it are thin

Not financial advice. Pulse, Forecast, and Margus are educational scenario tools.

## Auth and data

Google sign-in, or a one-time link mailed to any address. No passwords. One account can open from more than one mailbox (`portfell_account_emails`), so signing in with a work address on one device and a personal one on another lands in the same portfolios rather than an empty second account. Shared portfolios use co-ownership (`portfell_portfolio_owners`), and a co-owner sees the whole portfolio, what each of you paid included; sharing a portfolio into a circle is a different thing and shows what you hold without what you paid. Communities are opt-in only: invite or an admin-approved join request. Never auto-join on sign-in.

Production data belongs on the dedicated Upside Lab Supabase project (`uzrnybyggznpvgxgrvgl`, `portfell_*` tables). Isolation is env (URL + keys), not a table rename. See `docs/UPSIDE_LAB_CUTOVER.md` and `scripts/export-upside-schema.sql`.

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...
UPSIDE_CANONICAL_HOST=upsidelab.app
NEXT_PUBLIC_SITE_URL=https://upsidelab.app
```

See `.env.example` for the full list. Market data uses Yahoo first, then optional Twelve Data / Finnhub keys. If every provider misses a ticker, the last cached price stays on screen. We never make a price up.

## Scripts

```bash
npm run lint
npm run typecheck
npm run test
npm run test:invariants
npm run check:edges
npm run validate
npm run bench:concurrency
npm run dr:export
npm run dr:restore
npm run migrate:online -- --lint supabase/migrations/20260823170000_one_account_more_than_one_address.sql
```

New migrations are timestamp-named (`YYYYMMDDHHMMSS_name.sql`). The numbered
`001_` to `054_` files are the earlier convention and stay as they are.

CI runs typecheck, lint, `npm test`, the invariants suite (`test:invariants`,
`check:edges`, `validate`, `bench:concurrency`), `npm audit`, the row level
security tests against a real Postgres, and the build. All of it gates a pull
request.

The SQL suite needs nothing but a local Postgres:

```bash
PGUSER=postgres PGHOST=localhost PGPASSWORD=postgres ./supabase/tests/run.sh
```

It builds the schema from the migrations in order and then asks the
database the questions a policy cannot answer by being read: whether one
person can reach another's portfolio, whether a deleted account leaves
anything behind, whether a class portfolio can spend money it has not got.

## The documentation

- `AGENTS.md` is the law of this repo: the voice rules, the design system,
  and a long list of decisions with the measurement that produced each one.
  It opens with what the product is for and a map of how to read it.
- `docs/POLISH_PASS.md` and `docs/AUDIT_CHECKLIST.md` are the standing
  audit: the second is the list of passes worth running before trusting a
  change, and the first is the live state of the current one.
- `docs/AUTH_AND_COMMUNITIES.md`, `docs/COOKIES.md`, `docs/STRIPE_BILLING.md`
  for the flows.
- `docs/DISASTER_RECOVERY.md`, `docs/ZERO_DOWNTIME_MIGRATIONS.md`,
  `docs/CRON_MONITORING.md`, `docs/SECRET_ROTATION.md` for running it.
- `docs/BRAND_MARK.md` and `DESIGN_TOKENS.md` for how it looks, and why.
