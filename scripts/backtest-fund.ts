/**
 * Upside Fund's rules, run over history.
 *
 * Every measurement quoted in `src/lib/fund-strategy.ts` came from this:
 * adjusted daily closes from the same feed the Fund trades on, the Fund's
 * own `readTicker` and `planTrades` called once per trading day exactly as
 * the cron calls them, trades at the close with `MEASURED_COST` each way
 * (the live Fund trades free, so a backtest that charges is the cautious one),
 * and the S&P 500 bought and held as the yardstick. Nothing here re-states
 * a rule, so a backtest and the live Fund cannot drift apart.
 *
 *   npx tsx scripts/backtest-fund.ts            # the two windows, this list
 *   npx tsx scripts/backtest-fund.ts --refresh  # fetch the closes again
 *
 * Two things it cannot do, said here so nobody reads more into its output.
 * The list is today's, so every company on it survived, which flatters any
 * backtest. And a rule tuned until this prints a good number has been
 * tuned on the past: change one only for a reason that holds on both
 * windows, and write the numbers next to the rule.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  FUND_BENCHMARK,
  FUND_RULES,
  FUND_UNIVERSE,
  planTrades,
  readTicker,
  type FundPosition,
  type FundRules,
  type TickerRead,
} from "../src/lib/fund-strategy";

type Series = { dates: string[]; closes: number[] };
const CACHE = ".dr-local/fund-backtest-closes.json";
const WINDOWS: [string, string][] = [
  ["2019-01-02", "2023-12-29"],
  ["2024-01-02", "2026-10-02"],
];
/** What each trade is charged here, each way, whatever the live Fund pays. */
const MEASURED_COST = 0.0005;
/** Enough closes behind any day for a 200-day average and a 126-day return. */
const LOOKBACK = 400;

async function loadCloses(tickers: string[], refresh: boolean): Promise<Record<string, Series>> {
  const cached: Record<string, Series> =
    !refresh && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const { default: YahooFinance } = await import("yahoo-finance2");
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const queue = tickers.filter((t) => !cached[t]);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          const chart = await yf.chart(t, { period1: new Date("2017-06-01"), interval: "1d" });
          const dates: string[] = [];
          const closes: number[] = [];
          for (const q of chart.quotes ?? []) {
            const v = q.adjclose ?? q.close;
            if (v == null || !(v > 0)) continue;
            dates.push(new Date(q.date).toISOString().slice(0, 10));
            closes.push(v);
          }
          cached[t] = { dates, closes };
        } catch (err) {
          console.error(`${t}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })
  );
  mkdirSync(".dr-local", { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cached));
  return cached;
}

export function backtest(
  data: Record<string, Series>,
  universe: readonly string[],
  rules: FundRules,
  from: string,
  to: string
) {
  const spy = data[FUND_BENCHMARK]!;
  const index: Record<string, Map<string, number>> = {};
  for (const t of [FUND_BENCHMARK, ...universe]) {
    if (data[t]) index[t] = new Map(data[t]!.dates.map((d, i) => [d, i]));
  }
  const days = spy.dates.filter((d) => d >= from && d <= to);
  let cash = 100_000;
  let parked = 0;
  const held = new Map<string, FundPosition>();
  const navs: number[] = [];
  let inCompanies = 0;
  let names = 0;
  let closed = 0;
  let wins = 0;
  const cost = rules.costPerTrade;

  for (const day of days) {
    const si = index[FUND_BENCHMARK]!.get(day)!;
    const benchCloses = spy.closes.slice(Math.max(0, si - LOOKBACK), si + 1);
    const reads: Record<string, TickerRead> = {};
    for (const t of universe) {
      const i = index[t]?.get(day);
      if (i == null) continue;
      const r = readTicker(t, data[t]!.closes.slice(Math.max(0, i - LOOKBACK), i + 1), benchCloses, rules);
      if (r) reads[t] = r;
    }
    const bench = readTicker(FUND_BENCHMARK, benchCloses, benchCloses, rules);
    for (const p of held.values()) {
      const r = reads[p.ticker];
      if (r) p.peak = Math.max(p.peak, r.price);
    }
    const orders = planTrades({ cash, parkedShares: parked, positions: [...held.values()], reads, bench, rules });
    for (const o of orders) {
      if (o.ticker === FUND_BENCHMARK) {
        if (o.side === "buy") {
          cash -= (o.shares * o.price) / (1 - cost);
          parked += o.shares;
        } else {
          const sh = Math.min(o.shares, parked);
          cash += sh * o.price * (1 - cost);
          parked -= sh;
        }
        continue;
      }
      const p = held.get(o.ticker);
      if (o.side === "sell") {
        if (!p) continue;
        const sh = Math.min(o.shares, p.shares);
        cash += sh * o.price * (1 - cost);
        p.shares -= sh;
        if (o.rule === "take-half") p.trimmed = true;
        if (p.shares <= 1e-9) {
          held.delete(o.ticker);
          closed += 1;
          if (o.price > p.entryPrice) wins += 1;
        }
      } else {
        cash -= (o.shares * o.price) / (1 - cost);
        if (p) {
          const total = p.shares + o.shares;
          p.entryPrice = (p.entryPrice * p.shares + o.price * o.shares) / total;
          p.shares = total;
        } else {
          held.set(o.ticker, { ticker: o.ticker, shares: o.shares, entryPrice: o.price, daysHeld: 0, peak: o.price, trimmed: false });
        }
      }
    }
    let companies = 0;
    for (const p of held.values()) {
      const i = index[p.ticker]!.get(day);
      const px = i != null ? data[p.ticker]!.closes[i]! : p.peak;
      companies += p.shares * px;
      p.daysHeld += 1;
    }
    const nav = cash + parked * (bench?.price ?? 0) + companies;
    navs.push(nav);
    inCompanies += companies / nav;
    names += held.size;
  }

  const years = (Date.parse(days.at(-1)!) - Date.parse(days[0]!)) / (365.25 * 86_400_000);
  const spyAt = (d: string) => spy.closes[index[FUND_BENCHMARK]!.get(d)!]!;
  const worstFall = (xs: number[]) => {
    let peak = 0;
    let worst = 0;
    for (const v of xs) {
      peak = Math.max(peak, v);
      worst = Math.min(worst, v / peak - 1);
    }
    return worst;
  };
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return {
    window: `${from} to ${to}`,
    fundYear: pct((navs.at(-1)! / navs[0]!) ** (1 / years) - 1),
    sp500Year: pct((spyAt(days.at(-1)!) / spyAt(days[0]!)) ** (1 / years) - 1),
    fundWorstFall: pct(worstFall(navs)),
    sp500WorstFall: pct(worstFall(days.map(spyAt))),
    inCompanies: pct(inCompanies / days.length),
    averageCompanies: (names / days.length).toFixed(1),
    closedTrades: closed,
    closedAtAGain: pct(closed ? wins / closed : 0),
  };
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const data = await loadCloses([FUND_BENCHMARK, ...FUND_UNIVERSE], refresh);
  for (const [from, to] of WINDOWS) {
    console.log(backtest(data, FUND_UNIVERSE, { ...FUND_RULES, costPerTrade: MEASURED_COST }, from, to));
  }
}

void main();
