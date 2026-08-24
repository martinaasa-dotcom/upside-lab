# Upside Lab

See what your book did. Ask Margus if the thesis still holds. Live prices, Thesis Pulse, and an open paper fund (Upside Fund). Communities are optional.

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

- **My portfolio** — holdings, cost basis, today's move
- **Pulse** — thesis check on your largest names, plus anything down 5%
- **Lab** — allocation, risk shocks, weekly trends, seasonality
- **Compound** — growth planner seeded from what you actually hold
- **Margus** — chat that can read and edit the portfolio (screenshot or CSV import too)
- **Fund / Communities / Account** — side rooms in the header, not extra home-screen heroes

Not financial advice. Pulse, Forecast, and Margus are educational scenario tools.

## Auth and data

Google SSO. Shared books use co-ownership (`portfell_portfolio_owners`). Communities are opt-in only: invite or an admin-approved join request. Never auto-join on sign-in.

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
npm run dr:export
npm run dr:restore
npm run migrate:online -- --lint supabase/migrations/20260823170000_one_account_more_than_one_address.sql
```

New migrations are timestamp-named (`YYYYMMDDHHMMSS_name.sql`). The numbered
`001_`–`054_` files are the earlier convention and stay as they are.

Ops: `docs/DISASTER_RECOVERY.md`, `docs/ZERO_DOWNTIME_MIGRATIONS.md`.
