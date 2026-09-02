import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT =
  "/tmp/claude-0/-home-user-upside-lab/d452d3fc-6289-5c6d-9cec-cac6d422e8a7/scratchpad/mine/circle";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3188";

const CID = "11111111-1111-4111-8111-111111111111";
const EMPTY = "22222222-2222-4222-8222-222222222222";

const people = [
  { id: "u1", name: "Martin Aasa", role: "admin", you: true },
  { id: "u2", name: "Amanda Aasa", role: "member", you: false },
  { id: "u3", name: "Rasmus Aasa", role: "member", you: false },
  { id: "u4", name: "Karoliine Aasa", role: "member", you: false },
  { id: "u5", name: "Liisa Tamm", role: "member", you: false },
  { id: "u6", name: "Jaan Kask", role: "member", you: false },
];

const holdings = [
  ["p1", "NVDA", 120, 96.3],
  ["p1", "AAPL", 60, 168.4],
  ["p1", "VOO", 40, 390.1],
  ["p1", "MSFT", 22, 305.2],
  ["p2", "VOO", 90, 380],
  ["p2", "VTI", 60, 240],
  ["p3", "AMD", 140, 110],
  ["p3", "NVDA", 40, 92],
  ["p3", "TSLA", 25, 210],
  ["p4", "AAPL", 30, 150],
  ["p4", "PFE", 200, 28],
  ["p4", "JNJ", 40, 150],
  ["p5", "BTC", 0.4, 41000],
  ["p5", "NVDA", 15, 100],
  ["p6", "VOO", 6, 400],
  ["p6", "AAPL", 4, 170],
];

const portfolios = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `p${n}`,
  name: `Portfolio ${n}`,
  slug: `portfolio-${n}`,
  sort_order: n,
  cash_balance: n === 1 ? 4200 : 900 * n,
}));

const meta = {
  community: {
    id: CID,
    name: "Aasa family",
    kind: "circle",
    visibility: "private",
    house_note: "Family portfolios, today's prices, no advice.",
  },
  members: people.map((p) => ({
    user_id: p.id,
    role: p.role,
    is_you: p.you,
    user_ids: [p.id],
    profile: { display_name: p.name, email: `${p.id}@example.com`, bio: null },
  })),
  pending_members: [],
  isAdmin: true,
  join_requests: [],
};

const book = {
  readOnly: true,
  profiles: people.map((p) => ({
    id: p.id,
    display_name: p.name,
    email: `${p.id}@example.com`,
    avatar_url: null,
  })),
  portfolios,
  holdings: holdings.map(([pid, t, sh, bp], i) => ({
    id: `h${i}`,
    portfolio_id: pid,
    ticker: t,
    shares: sh,
    buy_price: bp,
    eoy_target: null,
    target_call_pct: 0.15,
    stock_target_override: null,
    sort_order: i,
  })),
  ownership: [1, 2, 3, 4, 5, 6].map((n) => ({
    portfolio_id: `p${n}`,
    user_id: `u${n}`,
  })),
  theses: {
    u1: {
      NVDA: "They make the chips every new data centre is built around, and orders are still booked out.",
      AAPL: "A billion people renew a phone they trust. Boring, and it pays for itself.",
    },
    u3: {
      NVDA: "Bought it because Martin would not stop talking about it. Want to learn what the business actually does.",
      AMD: "The cheaper way into the same idea, if they can catch up on software.",
    },
    u5: { NVDA: "" },
  },
};

const emptyMeta = {
  community: {
    id: EMPTY,
    name: "Friday lunch crowd",
    kind: "circle",
    visibility: "private",
    house_note: null,
  },
  members: [
    {
      user_id: "u1",
      role: "admin",
      is_you: true,
      user_ids: ["u1"],
      profile: { display_name: "Martin Aasa", email: "u1@example.com", bio: null },
    },
  ],
  pending_members: [],
  isAdmin: true,
  join_requests: [],
};
const emptyBook = {
  readOnly: true,
  profiles: [],
  portfolios: [],
  holdings: [],
  ownership: [],
};

const prices = {
  NVDA: [182.4, 178.2],
  AAPL: [231.1, 233.0],
  VOO: [601.2, 598.4],
  VTI: [312.0, 310.9],
  MSFT: [512.4, 515.0],
  AMD: [166.3, 171.0],
  TSLA: [402.1, 396.0],
  PFE: [25.4, 25.6],
  JNJ: [178.2, 177.1],
  BTC: [96000, 98200],
};

function quotesFor(list) {
  const out = {};
  for (const t of list) {
    const [price, prev] = prices[t] ?? [100, 100];
    out[t] = {
      ticker: t,
      price,
      change: price - prev,
      changePercent: (price - prev) / prev,
      previousClose: prev,
      sparkline: [prev, price],
      marketState: "REGULAR",
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      currency: "USD",
      nativePrice: price,
      quotedAt: Date.now(),
      dailyCloses: [
        { date: "2026-09-01", close: prev },
        { date: "2026-09-02", close: price },
      ],
    };
  }
  return out;
}

const duel = {
  dayKey: "2026-09-03",
  pair: { a: "NVDA", b: "AMD" },
  myPick: "a",
  counts: { a: 3, b: 2 },
  settled: false,
  pickCount: 5,
  streak: 3,
  previous: {
    dayKey: "2026-09-02",
    pair: { a: "NVDA", b: "AAPL" },
    counts: { a: 4, b: 1 },
    pctA: 0.0141,
    pctB: -0.0032,
    winner: "a",
    myPick: "a",
    calledIt: ["Liisa Tamm", "Jaan Kask", "Martin Aasa"],
  },
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});

const shots = process.argv[2]
  ? process.argv[2].split(",")
  : ["list", "empty", "overview", "league", "members", "member"];

for (const [w, h] of [
  [390, 844],
  [1280, 800],
]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 300)));

  await page.addInitScript(() => {
    try {
      localStorage.setItem("portfell-welcome-tour", "99");
      localStorage.setItem("upside-analytics-consent-v1", "deny");
      localStorage.setItem("portfell-analytics-consent", "declined");
      localStorage.setItem("portfell-demo-v8", JSON.stringify({ portfolios: [], holdings: [] }));
      // A forged local session, so SignInGate renders the room rather than
      // the marketing landing. Every /api call is intercepted below, so
      // this token never leaves the browser and nothing verifies it.
      const b64 = (o) =>
        btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
      const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
        sub: "u1",
        email: "u1@example.com",
        role: "authenticated",
        exp,
      })}.x`;
      localStorage.setItem(
        "sb-uzrnybyggznpvgxgrvgl-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "r",
          token_type: "bearer",
          expires_in: 86400,
          expires_at: exp,
          user: {
            id: "u1",
            aud: "authenticated",
            role: "authenticated",
            email: "u1@example.com",
            app_metadata: {},
            user_metadata: { full_name: "Martin Aasa" },
            created_at: "2026-01-01T00:00:00Z",
          },
        })
      );
      localStorage.setItem("upside-last-user-v1", JSON.stringify({ id: "u1", email: "u1@example.com" }));
    } catch {}
  });

  await page.route("**/auth/v1/**", async (route) => {
    const user = {
      id: "u1",
      aud: "authenticated",
      role: "authenticated",
      email: "u1@example.com",
      app_metadata: {},
      user_metadata: { full_name: "Martin Aasa" },
      created_at: "2026-01-01T00:00:00Z",
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().url().includes("/user")
          ? user
          : {
              access_token: "a",
              refresh_token: "r",
              token_type: "bearer",
              expires_in: 86400,
              expires_at: Math.floor(Date.now() / 1000) + 86400,
              user,
            }
      ),
    });
  });

  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.includes(`/api/communities/${CID}/book`)) return json(book);
    if (url.includes(`/api/communities/${CID}/duel`)) return json(duel);
    if (url.includes(`/api/communities/${CID}/invites`)) return json({ invites: [] });
    if (url.includes(`/api/communities/${CID}/sheets`))
      return json({
        sheets: [
          { id: "p1", name: "My portfolio", shared: true },
          { id: "p9", name: "Kids' fund", shared: false },
        ],
      });
    if (url.includes(`/api/communities/${CID}`)) return json(meta);
    if (url.includes(`/api/communities/${EMPTY}/book`)) return json(emptyBook);
    if (url.includes(`/api/communities/${EMPTY}/duel`))
      return json({ dayKey: "2026-09-03", pair: null, myPick: null, counts: { a: 0, b: 0 }, settled: false, pickCount: 0 });
    if (url.includes(`/api/communities/${EMPTY}/invites`)) return json({ invites: [] });
    if (url.includes(`/api/communities/${EMPTY}/sheets`))
      return json({
        sheets: [
          { id: "p1", name: "My portfolio", shared: false },
          { id: "p9", name: "Kids' fund", shared: false },
        ],
      });
    if (url.includes(`/api/communities/${EMPTY}`)) return json(emptyMeta);
    if (url.includes("/api/communities/discover")) return json({ communities: [] });
    if (url.endsWith("/api/communities") || url.includes("/api/communities?"))
      return json({
        communities: [
          { id: CID, name: "Aasa family", role: "admin", visibility: "private", kind: "circle" },
          { id: EMPTY, name: "Friday lunch crowd", role: "admin", visibility: "private", kind: "circle" },
          { id: "33333333-3333-4333-8333-333333333333", name: "Econ 201", role: "member", visibility: "private", kind: "classroom" },
        ],
      });
    if (url.includes("/api/quotes") || url.includes("/api/market/quotes"))
      return json({
        quotes: quotesFor(Object.keys(prices)),
        fx: { eurUsd: 1.08, gbpUsd: 1.27, usdPer: {} },
        updatedAt: Date.now(),
      });
    if (url.includes("/api/auth/me"))
      return json({ user: { id: "u1", email: "u1@example.com" } });
    return json({});
  });

  async function shoot(name, path, after) {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1200);
    if (after) await after(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const count = await page.evaluate(() => document.querySelectorAll("*").length);
    console.log(`${name} @${w}: height ${height}, elements ${count}, errors ${errors.length}`);
    if (errors.length) console.log("   " + errors.slice(0, 4).join("\n   "));
    errors.length = 0;
  }

  if (shots.includes("list")) await shoot("list", "/communities");
  if (shots.includes("empty")) await shoot("empty", `/communities/${EMPTY}`);
  if (shots.includes("overview")) await shoot("overview", `/communities/${CID}`);
  async function click(p, locator, what) {
    try {
      await locator.first().click({ timeout: 4000 });
    } catch {
      console.log(`  (could not click ${what})`);
    }
    await p.waitForTimeout(700);
  }
  async function tab(p, label) {
    await click(
      p,
      p.locator(`button:visible`, { hasText: new RegExp(`^${label}$`) }),
      label
    );
  }
  if (shots.includes("league"))
    await shoot("league", `/communities/${CID}`, (p) => tab(p, "Animals"));
  if (shots.includes("leagueopen"))
    await shoot("leagueopen", `/communities/${CID}`, async (p) => {
      await tab(p, "Animals");
      await click(p, p.locator('button[aria-expanded="false"]:visible'), "an animal row");
    });
  if (shots.includes("members"))
    await shoot("members", `/communities/${CID}`, (p) => tab(p, "Members"));
  if (shots.includes("member"))
    await shoot("member", `/communities/${CID}`, async (p) => {
      await click(p, p.locator("button:visible", { hasText: "Rasmus Aasa" }), "Rasmus");
    });
  if (shots.includes("reasons"))
    await shoot("reasons", `/communities/${CID}`, async (p) => {
      // "Holdings you share" is inside a BelowFold, so it is not in the
      // tree until the reader gets near it.
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await p.waitForTimeout(900);
      await click(p, p.locator('[data-slot="item"] >> text=$NVDA'), "the NVDA row");
    });

  await ctx.close();
}
await browser.close();
