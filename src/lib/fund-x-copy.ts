import { NO_VALUE, cashtag, currency, signedCurrency, signedPercent } from "@/lib/format";
import type { FundAction } from "@/lib/margus-fund";
import { FUND_X_HANDLE, FUND_X_URL } from "@/lib/product";

export { FUND_X_HANDLE, FUND_X_URL };
/** Free X cap. X counts UTF-16 code units. */
export const TWEET_MAX = 280;

export type FundStretch = {
  dollar?: number | null;
  pct?: number | null;
  spyPct?: number | null;
};

export type FundXPostInput = {
  serial: number;
  daily?: FundStretch | null;
  weekly?: FundStretch | null;
  total?: FundStretch | null;
  balance?: number | null;
  actions?: Array<Pick<FundAction, "type" | "ticker">>;
  movers?: Array<{ ticker: string; changePct: number | null | undefined }>;
  radar?: Array<{ ticker: string; waitFor?: string | null }>;
};

const TRADE_VERB: Record<Exclude<FundAction["type"], "hold">, string> = {
  buy: "bought",
  exit: "sold",
  trim: "trimmed",
  add: "bought",
};

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

/** X's free-tier counter: UTF-16 code units (same as JS string.length). */
export function tweetLength(text: string): number {
  return text.length;
}

function pct2(n: number): string {
  return signedPercent(n, 2);
}

function pct1(n: number): string {
  return signedPercent(n, 1);
}

function vsSpyMark(fundPct: number | null, spyPct: number | null): string {
  if (!finite(fundPct)) return "🔴";
  if (!finite(spyPct)) return fundPct >= 0 ? "🟢" : "🔴";
  return fundPct >= spyPct ? "🟢" : "🔴";
}

function moneyPct(dollar: number | null, change: number | null): string | null {
  const d = finite(dollar) ? signedCurrency(dollar, 0) : null;
  const p = finite(change) ? pct2(change) : null;
  if (d && p) return `${d} (${p})`;
  return d ?? p;
}

function stretchLine(
  label: string,
  stretch: FundStretch | null | undefined
): string | null {
  if (!stretch) return null;
  const move = moneyPct(stretch.dollar ?? null, stretch.pct ?? null);
  if (!move) return null;
  const spy = finite(stretch.spyPct) ? ` · $SPY ${pct2(stretch.spyPct)}` : "";
  return `${vsSpyMark(stretch.pct ?? null, stretch.spyPct ?? null)} ${label} ${move}${spy}`;
}

function plainTicker(ticker: string): string {
  return ticker.trim().toLowerCase();
}

/**
 * Day 5: held
 * Day 6: bought msft
 * Day 7: sold msft, bought nvda
 */
function actionHeadline(
  period: "DAY" | "WEEK",
  serial: number,
  actions: Array<Pick<FundAction, "type" | "ticker">>
): string {
  const label = period === "DAY" ? "Day" : "Week";
  const trades = actions.filter((a) => a.type !== "hold" && a.ticker.trim());
  if (trades.length === 0) return `${label} ${serial}: held`;

  const parts: string[] = [];
  let lastVerb: string | null = null;
  let tickers: string[] = [];
  const flush = () => {
    if (!lastVerb || tickers.length === 0) return;
    parts.push(`${lastVerb} ${tickers.join(", ")}`);
    tickers = [];
  };
  for (const a of trades) {
    if (a.type === "hold") continue;
    const t = plainTicker(a.ticker);
    if (!t) continue;
    const verb = TRADE_VERB[a.type];
    if (verb !== lastVerb) {
      flush();
      lastVerb = verb;
    }
    if (!tickers.includes(t)) tickers.push(t);
  }
  flush();
  if (parts.length === 0) return `${label} ${serial}: held`;
  return `${label} ${serial}: ${parts.join(", ")}`;
}

function formatMover(m: {
  ticker: string;
  changePct: number;
}): string {
  const n = m.changePct;
  return `${cashtag(m.ticker)} ${pct1(n)} ${n >= 0 ? "🟢" : "🔴"}`;
}

function rankedMovers(
  movers: Array<{ ticker: string; changePct: number | null | undefined }>
): Array<{ ticker: string; changePct: number }> {
  return movers
    .filter((m): m is { ticker: string; changePct: number } =>
      Boolean(m.ticker.trim() && finite(m.changePct))
    )
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

function shortWait(waitFor: string): string {
  const trimmed = waitFor
    .replace(/^wait(?:ing)? for\s+/i, "")
    .replace(/[\u2010\u2011\u2212\u2014]/g, "-")
    .trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/).slice(0, 3).join(" ").replace(/[.,;:]+$/, "");
}

function thesisLine(
  actions: Array<Pick<FundAction, "type" | "ticker">>
): string | null {
  const exits = [
    ...new Set(
      actions
        .filter((a) => a.type === "exit" && a.ticker.trim())
        .map((a) => cashtag(a.ticker))
        .filter((tag) => tag !== NO_VALUE)
    ),
  ];
  if (exits.length === 0) return null;
  return `Thesis broken on ${exits.join(" · ")}`;
}

function joinBody(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => p != null).join("\n");
}

function composeFundXPost(
  period: "DAY" | "WEEK",
  input: FundXPostInput
): string {
  const actions = input.actions ?? [];
  const headline = actionHeadline(period, input.serial, actions);
  const stretches = joinBody([
    stretchLine("Day", input.daily),
    stretchLine("Wk", input.weekly),
    stretchLine("Tot", input.total),
  ]);
  const balance = finite(input.balance)
    ? `💼 ${currency(input.balance, 0)}`
    : null;
  const thesis = thesisLine(actions);

  const movers = rankedMovers(input.movers ?? []);
  const radarItems = (input.radar ?? [])
    .map((item) => {
      const tag = cashtag(item.ticker);
      if (tag === NO_VALUE) return null;
      const wait = shortWait(item.waitFor ?? "");
      return { tag, wait, withWait: wait ? `${tag} ${wait}` : tag };
    })
    .filter((x): x is { tag: string; wait: string; withWait: string } =>
      Boolean(x)
    );

  // Pack movers (up to 4) and radar wait-fors until we sit near the free cap.
  let moverCount = Math.min(2, movers.length);
  let radarWithWait = false;

  const build = (): string => {
    const moverLine =
      moverCount > 0
        ? movers.slice(0, moverCount).map(formatMover).join(" ")
        : null;
    const radarBits = radarItems.map((r) =>
      radarWithWait ? r.withWait : r.tag
    );
    const radarLine =
      radarBits.length > 0 ? `👀 ${[...new Set(radarBits)].join(" · ")}` : null;

    return joinBody([
      headline,
      "",
      stretches || null,
      "",
      balance,
      moverLine,
      thesis,
      radarLine,
    ]);
  };

  let text = build();
  // Prefer richer radar notes, then more movers, while staying under the cap.
  if (tweetLength(text) <= TWEET_MAX && radarItems.some((r) => r.wait)) {
    radarWithWait = true;
    const richer = build();
    if (tweetLength(richer) <= TWEET_MAX) text = richer;
    else radarWithWait = false;
  }
  while (moverCount < Math.min(4, movers.length)) {
    moverCount += 1;
    const next = build();
    if (tweetLength(next) > TWEET_MAX) {
      moverCount -= 1;
      break;
    }
    text = next;
  }

  if (tweetLength(text) <= TWEET_MAX) return text;

  // Trim in priority order if a heavy trade day still overflows.
  radarWithWait = false;
  text = build();
  if (tweetLength(text) <= TWEET_MAX) return text;

  while (moverCount > 0 && tweetLength(text) > TWEET_MAX) {
    moverCount -= 1;
    text = build();
  }
  if (tweetLength(text) <= TWEET_MAX) return text;

  // Last resort: drop radar entirely.
  const bare = joinBody([
    headline,
    "",
    stretches || null,
    "",
    balance,
    thesis,
  ]);
  return tweetLength(bare) <= TWEET_MAX ? bare : bare.slice(0, TWEET_MAX);
}

export function composeDailyFundPost(input: FundXPostInput): string {
  return composeFundXPost("DAY", input);
}

export function composeWeeklyFundPost(input: FundXPostInput): string {
  return composeFundXPost("WEEK", input);
}
