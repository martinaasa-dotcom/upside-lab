import { todayKeyInTz } from "@/lib/timezone";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import { hashSeed, mulberry32, pick, shuffleInPlace } from "@/lib/seeded-rng";
import { cashtag, plural } from "@/lib/format";

type FactCtx = {
  sheets: SheetScore[];
  tickers: TickerScore[];
  totals: OverviewModel["totals"];
  dayKey: string;
  rng: () => number;
  hideOptions: boolean;
};

type FactMaker = (ctx: FactCtx) => string | null;

function pct1(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function money(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function byRoiDesc(a: TickerScore, b: TickerScore) {
  return b.roiPct - a.roiPct;
}
function byRoiAsc(a: TickerScore, b: TickerScore) {
  return a.roiPct - b.roiPct;
}
function byValueDesc(a: TickerScore, b: TickerScore) {
  return b.currentValue - a.currentValue;
}
function byTodayDesc(a: TickerScore, b: TickerScore) {
  return (b.todayPct ?? -Infinity) - (a.todayPct ?? -Infinity);
}
function byTodayAsc(a: TickerScore, b: TickerScore) {
  return (a.todayPct ?? Infinity) - (b.todayPct ?? Infinity);
}

const MAKERS: FactMaker[] = [
  ({ sheets, totals, rng }) => {
    const biggest = [...sheets].sort((a, b) => b.totalValue - a.totalValue)[0];
    if (!biggest || totals.totalValue <= 0) return null;
    const share = Math.round((biggest.totalValue / totals.totalValue) * 100);
    return pick(rng, [
      `${biggest.portfolio.name} is the heavyweight portfolio, ${share}% of everything together.`,
      `${biggest.portfolio.name} is carrying ${share}% of everything together. No pressure.`,
      `If these portfolios were a group, ${biggest.portfolio.name} would be the admin (${share}% of the pile).`,
      `${biggest.portfolio.name} ate ${share}% of the pie. The others are sharing crumbs politely.`,
    ]);
  },

  ({ sheets, rng }) => {
    const smallest = [...sheets].sort((a, b) => a.totalValue - b.totalValue)[0];
    if (!smallest) return null;
    return pick(rng, [
      `${smallest.portfolio.name} is the scrappy underdog portfolio at $${money(smallest.totalValue)}.`,
      `Tiny but mighty? ${smallest.portfolio.name} clocks in at $${money(smallest.totalValue)}.`,
      `${smallest.portfolio.name} is running the guerrilla campaign, only $${money(smallest.totalValue)} on the board.`,
    ]);
  },

  ({ tickers, rng }) => {
    const hot = [...tickers].sort(byRoiDesc)[0];
    if (!hot || hot.roiPct <= 0) return null;
    const where =
      hot.portfolios.length > 1
        ? `across ${hot.portfolios.join(" · ")}`
        : `in ${hot.portfolios[0]}`;
    return pick(rng, [
      `${cashtag(hot.ticker)} is the lifetime MVP at ${pct1(hot.roiPct)} ROI ${where}.`,
      `Hall of fame: ${cashtag(hot.ticker)} printed ${pct1(hot.roiPct)} ROI ${where}.`,
      `${cashtag(hot.ticker)} has been eating well: ${pct1(hot.roiPct)} lifetime ROI ${where}.`,
      `Somebody high-fived ${cashtag(hot.ticker)}: ${pct1(hot.roiPct)} ROI ${where}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const cold = [...tickers].sort(byRoiAsc)[0];
    if (!cold || cold.roiPct >= 0) return null;
    return pick(rng, [
      `${cashtag(cold.ticker)} is the drama queen at ${pct1(cold.roiPct)}, owned by ${cold.portfolios.join(", ")}.`,
      `${cashtag(cold.ticker)} is on a villain arc (${pct1(cold.roiPct)}) in ${cold.portfolios.join(", ")}.`,
      `Character development pending: ${cashtag(cold.ticker)} sits at ${pct1(cold.roiPct)}.`,
      `${cashtag(cold.ticker)} whispered “I’m just resting” at ${pct1(cold.roiPct)}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const most = [...tickers].sort(
      (a, b) =>
        b.portfolios.length - a.portfolios.length ||
        b.currentValue - a.currentValue
    )[0];
    if (!most || most.portfolios.length < 2) return null;
    return pick(rng, [
      `${cashtag(most.ticker)} is the crowd favorite, in ${most.portfolios.length} portfolios (${most.portfolios.join(", ")}).`,
      `Conspiracy board: ${cashtag(most.ticker)} shows up in ${most.portfolios.length} portfolios.`,
      `${cashtag(most.ticker)} is in every portfolio that matters here (${most.portfolios.join(", ")}).`,
      `${cashtag(most.ticker)} shows up in ${most.portfolios.length} portfolios (${most.portfolios.join(", ")}).`,
    ]);
  },

  ({ tickers, rng }) => {
    const solo = tickers.filter((t) => t.portfolios.length === 1);
    if (!solo.length) return null;
    const t = pick(rng, solo);
    return pick(rng, [
      `${cashtag(t.ticker)} is a solo act, only ${t.portfolios[0]} dared.`,
      `Exclusive drop: ${cashtag(t.ticker)} lives only in ${t.portfolios[0]}.`,
      `${t.portfolios[0]} has a private ${cashtag(t.ticker)} stash. No sharing.`,
    ]);
  },

  ({ tickers, rng }) => {
    const day = [...tickers].filter((t) => t.todayPct != null).sort(byTodayDesc)[0];
    if (!day || (day.todayPct ?? 0) <= 0) return null;
    return pick(rng, [
      `Today's main character: ${cashtag(day.ticker)} at ${pct1(day.todayPct!)}, $${money(day.todayDollar)} of smile.`,
      `${cashtag(day.ticker)} stole the scene today (+${pct1(day.todayPct!)}, $${money(day.todayDollar)}).`,
      `Green confetti for ${cashtag(day.ticker)}: ${pct1(day.todayPct!)} / $${money(day.todayDollar)}.`,
      `Plot twist (bullish): ${cashtag(day.ticker)} ripped ${pct1(day.todayPct!)} today.`,
    ]);
  },

  ({ tickers, rng }) => {
    const day = [...tickers].filter((t) => t.todayPct != null).sort(byTodayAsc)[0];
    if (!day || (day.todayPct ?? 0) >= 0) return null;
    return pick(rng, [
      `Today's villain: ${cashtag(day.ticker)} at ${pct1(day.todayPct!)} ($${money(day.todayDollar)}).`,
      `${cashtag(day.ticker)} brought the rain: ${pct1(day.todayPct!)} on the day.`,
      `Somebody unplugged ${cashtag(day.ticker)}: ${pct1(day.todayPct!)} today.`,
    ]);
  },

  ({ totals, rng }) => {
    if (totals.cash === 0) return null;
    if (totals.cash < 0) {
      return pick(rng, [
        `Combined cash is $${money(totals.cash)}. Someone is surfing on margin.`,
        `Someone is $${money(Math.abs(totals.cash))} into the broker's cookie jar.`,
        `Negative cash alert: $${money(totals.cash)}. Bold. Chaotic. On brand.`,
      ]);
    }
    const croissants = Math.max(1, Math.round(totals.cash / 3.2));
    const coffees = Math.max(1, Math.round(totals.cash / 4.5));
    return pick(rng, [
      `There's $${money(totals.cash)} sitting ready across your portfolios.`,
      `Cash pile: $${money(totals.cash)}, enough for ~${croissants.toLocaleString("en-US")} Tallinn croissants (theoretically).`,
      `$${money(totals.cash)} idle cash ≈ ${coffees.toLocaleString("en-US")} fancy coffees. Deploy wisely.`,
      `Cash report: $${money(totals.cash)} waiting for a spicy dip.`,
    ]);
  },

  ({ tickers, totals, rng }) => {
    const top = [...tickers].sort(byValueDesc)[0];
    if (!top || totals.equityValue <= 0) return null;
    const share = Math.round((top.currentValue / totals.equityValue) * 100);
    return pick(rng, [
      `${cashtag(top.ticker)} alone is ${share}% of all equity. Concentration is a feature (probably).`,
      `One ticker to rule them: ${cashtag(top.ticker)} is ${share}% of equity.`,
      `${cashtag(top.ticker)} hogged ${share}% of the equity buffet.`,
    ]);
  },

  ({ tickers, totals, rng }) => {
    const top3 = [...tickers].sort(byValueDesc).slice(0, 3);
    if (top3.length < 3 || totals.equityValue <= 0) return null;
    const share = Math.round(
      (top3.reduce((s, t) => s + t.currentValue, 0) / totals.equityValue) * 100
    );
    return pick(rng, [
      `Your three biggest holdings (${top3.map((t) => t.ticker).join(", ")}) are ${share}% of what you own in stocks.`,
      `The podium (${top3.map((t) => t.ticker).join(" / ")}) owns ${share}% of the stack.`,
      `${share}% of equity lives in just three tickers. Minimalism, but make it finance.`,
    ]);
  },

  ({ sheets, rng }) => {
    const busy = [...sheets].sort((a, b) => b.holdingCount - a.holdingCount)[0];
    if (!busy) return null;
    return pick(rng, [
      `${busy.portfolio.name} has the fullest toy box: ${plural(busy.holdingCount, "holding")}.`,
      `Most positions: ${busy.portfolio.name} with ${plural(busy.holdingCount, "line item")}.`,
      `${busy.portfolio.name} collected ${plural(busy.holdingCount, "stamp")} in the ticker passport.`,
    ]);
  },

  ({ sheets, rng }) => {
    const lean = [...sheets].sort((a, b) => a.holdingCount - b.holdingCount)[0];
    if (!lean) return null;
    return pick(rng, [
      `${lean.portfolio.name} keeps it tight, only ${plural(lean.holdingCount, "holding")}.`,
      `Minimalist award: ${lean.portfolio.name} (${plural(lean.holdingCount, "position")}).`,
      `${lean.portfolio.name} said “fewer, better”: ${plural(lean.holdingCount, "holding")}.`,
    ]);
  },

  ({ sheets, rng }) => {
    const best = [...sheets].sort((a, b) => b.roiPct - a.roiPct)[0];
    if (!best) return null;
    return pick(rng, [
      `Best portfolio ROI: ${best.portfolio.name} at ${pct1(best.roiPct)}.`,
      `${best.portfolio.name} is winning the homework contest (${pct1(best.roiPct)} ROI).`,
      `Report card A: ${best.portfolio.name} · ${pct1(best.roiPct)}.`,
    ]);
  },

  ({ sheets, rng }) => {
    const day = [...sheets]
      .filter((s) => s.todayPct != null)
      .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0))[0];
    if (!day || (day.todayPct ?? 0) === 0) return null;
    return pick(rng, [
      `${day.portfolio.name} is today's top portfolio (${pct1(day.todayPct!)}, $${money(day.todayDollar)}).`,
      `Intraday crown: ${day.portfolio.name} at ${pct1(day.todayPct!)}.`,
      `${day.portfolio.name} moved $${money(day.todayDollar)} today. Main-character energy.`,
    ]);
  },

  ({ tickers, rng }) => {
    const hot = [...tickers].sort(byRoiDesc);
    const silver = hot[1];
    if (!silver || silver.roiPct <= 0) return null;
    return pick(rng, [
      `Silver medal ROI: ${cashtag(silver.ticker)} at ${pct1(silver.roiPct)} (still elite).`,
      `Not first, not last: ${cashtag(silver.ticker)} quietly printed ${pct1(silver.roiPct)}.`,
      `Runner-up flex: ${cashtag(silver.ticker)} · ${pct1(silver.roiPct)} ROI.`,
    ]);
  },

  ({ tickers, rng }) => {
    const flat = [...tickers]
      .map((t) => ({ t, abs: Math.abs(t.roiPct) }))
      .sort((a, b) => a.abs - b.abs)[0];
    if (!flat) return null;
    return pick(rng, [
      `${cashtag(flat.t.ticker)} is the most “meh” at ${pct1(flat.t.roiPct)} ROI. Zen mode.`,
      `Boring-on-purpose award: ${cashtag(flat.t.ticker)} (${pct1(flat.t.roiPct)}).`,
      `${cashtag(flat.t.ticker)} refused the plot: ROI ≈ ${pct1(flat.t.roiPct)}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const fat = [...tickers].sort((a, b) => b.shares - a.shares)[0];
    if (!fat || fat.shares < 1) return null;
    return pick(rng, [
      `Share hoarder: ${fat.shares.toLocaleString("en-US")} shares of ${cashtag(fat.ticker)} across your portfolios.`,
      `If shares were stickers, ${cashtag(fat.ticker)} would cover the fridge (${fat.shares.toLocaleString("en-US")} of them).`,
      `${cashtag(fat.ticker)} share count: ${fat.shares.toLocaleString("en-US")}. That's a lot of opinions.`,
    ]);
  },

  ({ tickers, rng }) => {
    const green = tickers.filter((t) => (t.todayPct ?? 0) > 0).length;
    const red = tickers.filter((t) => (t.todayPct ?? 0) < 0).length;
    if (green + red === 0) return null;
    return pick(rng, [
      `Scoreboard today: ${green} green · ${red} red across unique tickers.`,
      `Mood ring: ${green} tickers smiling, ${red} frowning.`,
      `Intraday census: greens ${green}, reds ${red}. Democracy is messy.`,
    ]);
  },

  ({ tickers, rng }) => {
    const spread =
      ([...tickers].sort(byRoiDesc)[0]?.roiPct ?? 0) -
      ([...tickers].sort(byRoiAsc)[0]?.roiPct ?? 0);
    if (spread <= 0) return null;
    return pick(rng, [
      `ROI gap between best and worst ticker: ${pct1(spread)}. Whiplash included.`,
      `Best-vs-worst ROI spread is ${pct1(spread)}. Same roof, many vibes.`,
      `The emotional range of your portfolio is ${pct1(spread)} of ROI. Method acting.`,
    ]);
  },

  ({ totals, rng }) => {
    if (totals.totalValue <= 0) return null;
    const cashShare = totals.cash / totals.totalValue;
    return pick(rng, [
      `Cash is ${pct1(cashShare)} of everything together: ${cashShare < 0 ? "levered chaos" : cashShare < 0.05 ? "fully invested energy" : "some cash sitting ready"}.`,
      `Portfolio vibe check: $${money(totals.totalValue)} total · cash share ${pct1(cashShare)}.`,
      `Family total: $${money(totals.totalValue)}. Not a small group project.`,
    ]);
  },

  ({ totals, rng }) => {
    const perSheet =
      totals.sheetCount > 0 ? totals.totalValue / totals.sheetCount : 0;
    if (perSheet <= 0) return null;
    return pick(rng, [
      `Average portfolio size: ~$${money(perSheet)} across ${plural(totals.sheetCount, "portfolio")}.`,
      `If you split the pie evenly: ~$${money(perSheet)} per portfolio (you won’t).`,
      `${plural(totals.sheetCount, "portfolio")} · ~$${money(perSheet)} average. Inequality is the spice.`,
    ]);
  },

  ({ tickers, rng }) => {
    const multi = tickers.filter((t) => t.portfolios.length >= 2);
    if (!multi.length) {
      return pick(rng, [
        "Zero overlapping tickers. Every portfolio is on its own island.",
        "No two portfolios here hold the same company. Parallel universes.",
      ]);
    }
    return pick(rng, [
      `${plural(multi.length, "ticker")} shared across 2+ portfolios. Family consensus (or copy-paste).`,
      `Overlap count: ${plural(multi.length, "name")} appearing in multiple portfolios.`,
      `Groupthink index: ${plural(multi.length, "multi-owned ticker")}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const dog = [...tickers]
      .filter((t) => t.roiPct < 0 && t.portfolios.length >= 2)
      .sort((a, b) => a.roiPct - b.roiPct)[0];
    if (!dog) return null;
    return pick(rng, [
      `${cashtag(dog.ticker)} is red (${pct1(dog.roiPct)}) yet still loved by ${dog.portfolios.length} portfolios. Loyalty!`,
      `Toxic fave: ${cashtag(dog.ticker)} at ${pct1(dog.roiPct)} but ${dog.portfolios.join(" + ")} won't quit.`,
      `${dog.portfolios.length} portfolios are bagholding ${cashtag(dog.ticker)} together. Bonding exercise.`,
    ]);
  },

  ({ totals, rng }) => {
    const pizzas = Math.max(1, Math.round(totals.totalValue / 25));
    return pick(rng, [
      `Everything together could fund ~${pizzas.toLocaleString("en-US")} very serious pizzas (do not).`,
      `In pizza units, your portfolios are worth ~${pizzas.toLocaleString("en-US")} larges. Hungry yet?`,
      `Fun conversion: your portfolio ÷ €25 ≈ ${pizzas.toLocaleString("en-US")} imaginary pizzas.`,
    ]);
  },

  ({ totals, rng }) => {
    const hours = Math.max(1, Math.round(totals.totalValue / 40));
    return pick(rng, [
      `At a fake €40/hr, your portfolios equal ~${hours.toLocaleString("en-US")} hours of labor. Touch grass accordingly.`,
      `Roughly ${hours.toLocaleString("en-US")} “hourly wage units” of portfolio value. Capitalism speedrun.`,
    ]);
  },

  ({ tickers, rng }) => {
    const t = pick(rng, tickers);
    const moon = Math.max(1, Math.round(t.shares / 10));
    return pick(rng, [
      `Random draw: ${cashtag(t.ticker)}, ${t.shares.toLocaleString("en-US")} shares, ~$${money(t.currentValue)} of opinions.`,
      `Today’s random spotlight: ${cashtag(t.ticker)} in ${t.portfolios.join(", ")}.`,
      `If each ${cashtag(t.ticker)} share were a step, you’d walk ~${moon.toLocaleString("en-US")} “share-steps”. Science? No.`,
    ]);
  },

  ({ sheets, rng }) => {
    const s = pick(rng, sheets);
    return pick(rng, [
      `${s.portfolio.name} flashcard: $${money(s.totalValue)} · ${pct1(s.roiPct)} vs cost · ${plural(s.holdingCount, "holding")}.`,
      `Portfolio of the RNG: ${s.portfolio.name} is ${s.roiPct >= 0 ? "up" : "down"} ${pct1(Math.abs(s.roiPct))} lifetime.`,
      `${s.portfolio.name} today: ${s.todayPct == null ? "quotes pending" : pct1(s.todayPct)} / $${money(s.todayDollar)}.`,
    ]);
  },

  ({ totals, rng }) => {
    return pick(rng, [
      `Census: ${plural(totals.sheetCount, "portfolio")} · ${plural(totals.uniqueTickers, "unique ticker")} · ${plural(totals.positionCount, "position")}.`,
      `The empire counts ${plural(totals.positionCount, "line item")} across ${plural(totals.sheetCount, "portfolio")}.`,
      `${plural(totals.uniqueTickers, "distinct ticker")} is either diversification or a snack drawer.`,
    ]);
  },

  ({ totals, rng }) => {
    if (totals.todayPct == null) return null;
    return pick(rng, [
      `Day P&L: ${pct1(totals.todayPct)} ($${money(totals.todayDollar)}). ${totals.todayDollar >= 0 ? "Nice." : "Oof."}`,
      `Combined today: $${money(totals.todayDollar)}. ${totals.todayDollar >= 0 ? "Green board." : "A rough print."}`,
      `Intraday mood: ${totals.todayDollar >= 0 ? "up" : "down"} at ${pct1(totals.todayPct)}.`,
    ]);
  },

  ({ dayKey, rng }) => {
    const weekday = new Date(`${dayKey}T12:00:00+03:00`).toLocaleDateString(
      "en-US",
      { weekday: "long", timeZone: "Europe/Tallinn" }
    );
    return pick(rng, [
      `It's ${weekday} in Tallinn. Perfect day to not check prices every 4 minutes (you will anyway).`,
      `${weekday} market folklore: your portfolios refuse to be boring today.`,
      `Tallinn says it's ${weekday}. The tickers have been notified.`,
    ]);
  },

  ({ tickers, rng }) => {
    const withSpark = tickers.filter((t) => t.sparkline.length >= 2);
    if (!withSpark.length) return null;
    const t = pick(rng, withSpark);
    const a = t.sparkline[0]!;
    const b = t.sparkline[t.sparkline.length - 1]!;
    const move = a > 0 ? (b - a) / a : 0;
    return pick(rng, [
      `${cashtag(t.ticker)}'s recent price trend (the mini-chart on its card): ${move >= 0 ? "up" : "down"} about ${pct1(Math.abs(move))} over that stretch.`,
      `Zoom into ${cashtag(t.ticker)}'s sparkline and it's ${move >= 0 ? "trending up" : "trending down"} roughly ${pct1(Math.abs(move))} lately.`,
    ]);
  },

  ({ tickers, rng }) => {
    const winners = tickers.filter((t) => t.roiPct > 0).length;
    const losers = tickers.filter((t) => t.roiPct < 0).length;
    return pick(rng, [
      `Lifetime win/loss by ticker: ${winners} up · ${losers} down.`,
      `Scoreboard (lifetime ROI): ${winners} in the green, ${losers} in the red.`,
      `${winners} tickers are up since you bought them; ${losers} are still underwater.`,
    ]);
  },
];

const FILLERS: FactMaker[] = [
  ({ dayKey, rng }) =>
    pick(rng, [
      `Daily seed ${dayKey}: the fun-fact machine ate its vitamins.`,
      `New batch unlocked for ${dayKey}. Yesterday’s jokes have left the building.`,
      `${dayKey} edition, same portfolios, different nonsense.`,
    ]),
  ({ rng, hideOptions }) =>
    pick(rng, [
      "Reminder: past performance is not indicative of future vibes.",
      "This message sponsored by nobody. Especially not the drama tickers.",
      "If you’re reading this, you scrolled. Respect.",
      ...(hideOptions
        ? []
        : ["Covered calls don’t write themselves. (Margus might try.)"]),
    ]),
  ({ sheets, rng }) => {
    const names = sheets.map((s) => s.portfolio.name);
    if (names.length < 2) return `Shout-out to ${names[0] ?? "your portfolio"}.`;
    return pick(rng, [
      `Roll call: ${names.join(" · ")}.`,
      `The Avengers assemble: ${names.join(", ")}.`,
      `In the chat today: ${names.join(" / ")}.`,
    ]);
  },
];

/**
 * 10 fun facts for the Tallinn calendar day — new set each day, mixed tones.
 */
export function buildDailyFunFacts(
  sheets: SheetScore[],
  tickers: TickerScore[],
  totals: OverviewModel["totals"],
  dayKey: string = todayKeyInTz(),
  hideOptions: boolean = true
): string[] {
  if (!sheets.length || !tickers.length) return [];

  const rng = mulberry32(hashSeed(`upside-fun|${dayKey}`));
  const ctx: FactCtx = { sheets, tickers, totals, dayKey, rng, hideOptions };

  const makers = shuffleInPlace(rng, [...MAKERS]);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (s: string | null) => {
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  for (const maker of makers) {
    if (out.length >= 10) break;
    try {
      push(maker(ctx));
    } catch {
      /* skip bad maker */
    }
  }

  const fillerPool = shuffleInPlace(rng, [...FILLERS, ...MAKERS]);
  for (const maker of fillerPool) {
    if (out.length >= 10) break;
    try {
      push(maker(ctx));
    } catch {
      /* skip */
    }
  }

  while (out.length < 10) {
    push(
      `Bonus bit #${out.length + 1} for ${dayKey}: still nothing wild happening.`
    );
  }

  return out.slice(0, 10);
}
