import { currency, percent, signedPercent } from "@/lib/format";
import { sampleHoldingBy } from "@/lib/sample-portfolio";

/**
 * Three made-up days in a made-up portfolio, played on the landing page and
 * on the first screen of the walkthrough.
 *
 * ## Why it replaced the red day
 *
 * Both of those screens used to open on one bad day: eight red tiles, and
 * the reader asked which of them had news. It taught the right idea and
 * sold the wrong thing. A page whose first word is "red" is a page about
 * losing money, and what this app is actually for is understanding it,
 * on every day, the good ones and the dull ones included. So the opening
 * picture is now a short week: one day a company made the day on its own
 * news, one day nothing happened anywhere, and one day the market fell
 * while a company rose on news of its own. Same lesson (the market, or the
 * company?), three times, without a single screen of red.
 *
 * Five companies rather than eight, because the eye can hold five chips
 * on one line and follow them from day to day.
 *
 * ## One sample, not two
 *
 * The five companies, their share counts and the price the week opens at
 * all come out of `sample-portfolio.ts`, the same list the Look around
 * button opens in the real app. Only the three days are new here, and they
 * are stored the way a real day is stored, as each company's move, with
 * every dollar figure, total and sentence worked out from those. Nothing
 * printed on the page is typed in beside the words it belongs to, which is
 * how the old samples drifted into contradicting themselves.
 *
 * ## Everything here is made up, and the page says so
 *
 * The companies are real because a sample of companies nobody has heard of
 * teaches nothing. The days are invented, and so is the news. Each surface
 * that draws this labels it as made up, and `landing-film.test.ts` holds
 * the arithmetic and the shape of the lesson.
 */

export const FILM_TICKERS = ["NVDA", "AAPL", "MSFT", "AMZN", "KO"] as const;
export type FilmTicker = (typeof FILM_TICKERS)[number];

/** The market line on the picture. Named the way a person says it. */
export const FILM_MARKET_NAME = "S&P 500";

/**
 * How far a company may sit from the market's own move and still be "the
 * market". About a point either way, the same allowance the old red day
 * used, so the cluster around the line is honestly a cluster.
 */
export const FILM_MARKET_SPREAD = 0.011;

type DayInput = {
  id: "mon" | "tue" | "wed";
  /** The day's name, in full. */
  day: string;
  /** Three letters, for the progress segments. */
  short: string;
  /** The market's move that day, as a fraction. */
  marketPct: number;
  /** Each company's move that day, as a fraction. */
  moves: Record<FilmTicker, number>;
  /**
   * The one company that moved on news of its own, and what the made-up
   * news was, in the words Pulse would use. Null on a day nothing happened.
   */
  news: { ticker: FilmTicker; said: string } | null;
};

const DAYS: readonly DayInput[] = [
  {
    id: "mon",
    day: "Monday",
    short: "Mon",
    marketPct: 0.006,
    moves: { NVDA: 0.062, AAPL: 0.008, MSFT: 0.004, AMZN: 0.009, KO: 0.002 },
    news: {
      ticker: "NVDA",
      said: "It told investors to expect more sales this year than it had said before.",
    },
  },
  {
    id: "tue",
    day: "Tuesday",
    short: "Tue",
    marketPct: 0.003,
    moves: { NVDA: 0.007, AAPL: 0.002, MSFT: 0.004, AMZN: 0.001, KO: 0.003 },
    news: null,
  },
  {
    id: "wed",
    day: "Wednesday",
    short: "Wed",
    marketPct: -0.009,
    moves: { NVDA: -0.012, AAPL: -0.008, MSFT: -0.011, AMZN: -0.007, KO: 0.043 },
    news: {
      ticker: "KO",
      said: "Its quarter came in stronger than anybody had expected.",
    },
  },
] as const;

export type FilmCompany = {
  ticker: FilmTicker;
  /** How a person says it out loud. */
  company: string;
  shares: number;
};

export const FILM_COMPANIES: readonly FilmCompany[] = FILM_TICKERS.map((t) => {
  const row = sampleHoldingBy(t);
  return { ticker: t, company: row.company, shares: row.shares };
});

export function filmCompany(ticker: FilmTicker): FilmCompany {
  return FILM_COMPANIES.find((c) => c.ticker === ticker)!;
}

/** One company on one day, worked out. */
export type FilmMove = {
  ticker: FilmTicker;
  company: string;
  pct: number;
  /** What the holding was worth at the start of the day. */
  open: number;
  /** What the day did to it, in dollars. */
  dollars: number;
  news: boolean;
  /** Pulse's one line on it. */
  verdict: string;
};

export type FilmDay = {
  id: DayInput["id"];
  day: string;
  short: string;
  marketPct: number;
  moves: FilmMove[];
  /** The portfolio at the start of the day and at the close. */
  open: number;
  close: number;
  dollars: number;
  pct: number;
  /** The company with news, if any. */
  news: FilmMove | null;
  /** How much of the day's dollars the news company accounts for. */
  newsShare: number;
  /** The caption: one short title and one or two sentences. */
  title: string;
  line: string;
};

function verdictFor(move: Omit<FilmMove, "verdict">, input: DayInput): string {
  if (input.news && input.news.ticker === move.ticker) {
    return `Its own news. ${input.news.said}`;
  }
  return "Moved with the market. Nothing was announced.";
}

/**
 * Today's price for each company, starting from the sample's own price and
 * carried day to day, so Tuesday opens where Monday closed.
 */
function buildWeek(): FilmDay[] {
  const price = new Map<FilmTicker, number>(
    FILM_TICKERS.map((t) => [t, sampleHoldingBy(t).previousClose])
  );
  return DAYS.map((input) => {
    const moves: FilmMove[] = FILM_COMPANIES.map((c) => {
      const before = price.get(c.ticker)!;
      const pct = input.moves[c.ticker];
      const open = c.shares * before;
      const base = {
        ticker: c.ticker,
        company: c.company,
        pct,
        open,
        dollars: open * pct,
        news: input.news?.ticker === c.ticker,
      };
      return { ...base, verdict: verdictFor(base, input) };
    });
    for (const m of moves) price.set(m.ticker, price.get(m.ticker)! * (1 + m.pct));

    const open = moves.reduce((s, m) => s + m.open, 0);
    const dollars = moves.reduce((s, m) => s + m.dollars, 0);
    const news = moves.find((m) => m.news) ?? null;
    const newsShare = news && dollars !== 0 ? news.dollars / dollars : 0;
    const day = {
      id: input.id,
      day: input.day,
      short: input.short,
      marketPct: input.marketPct,
      moves,
      open,
      close: open + dollars,
      dollars,
      pct: dollars / open,
      news,
      newsShare,
    };
    return { ...day, ...caption(day) };
  });
}

/**
 * The caption, written from the day's own figures.
 *
 * Three shapes, chosen by what the numbers say rather than by which day it
 * is, so editing a move cannot leave a sentence describing a different day.
 */
function caption(day: Omit<FilmDay, "title" | "line">): {
  title: string;
  line: string;
} {
  const n = day.moves.length - 1;
  const others = ["no", "one", "two", "three", "four"][n] ?? String(n);
  if (!day.news) {
    return {
      title: "A quiet day",
      line: `Nothing was announced at any of your companies. All ${["", "", "two", "three", "four", "five"][day.moves.length] ?? day.moves.length} moved with the market.`,
    };
  }
  const name = day.news.company;
  if (Math.sign(day.news.pct) !== Math.sign(day.marketPct)) {
    const finish =
      Math.abs(day.pct) < 0.0025
        ? "Your day came out about even."
        : day.pct > 0
          ? `Your day still finished ${signedPercent(day.pct)}.`
          : `Your day finished ${signedPercent(day.pct)}, less than the market.`;
    const market = day.marketPct < 0 ? "fell" : "rose";
    const own = day.news.pct > 0 ? "rose" : "fell";
    return {
      title: `The market ${market}, ${name} ${own}`,
      line: `${name} ${own} on its own news while everything else ${market} with the market. ${finish}`,
    };
  }
  const most = day.newsShare >= 0.5 ? "most" : "a big part";
  return {
    title: `${name} made the day`,
    line: `${name} made ${most} of today's ${day.dollars > 0 ? "gain" : "fall"}, on its own news. The other ${others} moved with the market.`,
  };
}

export const FILM_DAYS: readonly FilmDay[] = buildWeek();

/* ------------------------------------------------------------ the week */

/** The week, Monday's open to Wednesday's close. */
export function filmWeek() {
  const first = FILM_DAYS[0]!;
  const last = FILM_DAYS[FILM_DAYS.length - 1]!;
  const dollars = FILM_DAYS.reduce((s, d) => s + d.dollars, 0);
  const marketPct =
    FILM_DAYS.reduce((acc, d) => acc * (1 + d.marketPct), 1) - 1;
  /* Each company's whole week, so "why did my week go well" has an answer. */
  const byCompany = FILM_TICKERS.map((t) => {
    const dollarsT = FILM_DAYS.reduce(
      (s, d) => s + d.moves.find((m) => m.ticker === t)!.dollars,
      0
    );
    const closeT = last.moves.find((m) => m.ticker === t)!;
    return {
      ticker: t,
      company: filmCompany(t).company,
      dollars: dollarsT,
      /** What it is worth at the end of the week, as a share of the whole. */
      share: (closeT.open + closeT.dollars) / last.close,
    };
  }).sort((a, b) => b.dollars - a.dollars);
  return {
    open: first.open,
    close: last.close,
    dollars,
    pct: dollars / first.open,
    marketPct,
    biggest: byCompany[0]!,
  };
}

/**
 * Margus's answer to "why did my week go well", from the week's figures.
 *
 * The company it names is whichever made the most money over the three
 * days, and the day and the move it quotes are that company's own, so the
 * sentence cannot name somebody the arithmetic does not.
 */
export function filmWeekAnswer(): { question: string; answer: string[] } {
  const week = filmWeek();
  const best = week.biggest;
  const day = FILM_DAYS.find((d) => d.news?.ticker === best.ticker);
  const move = day?.moves.find((m) => m.ticker === best.ticker);
  return {
    question: "Why did my week go so well?",
    answer: [
      `Mostly ${best.company}: ${currency(best.dollars, 0)} of your ${currency(week.dollars, 0)}.`,
      day && move
        ? `It rose ${percent(move.pct)} on ${day.day}, on its own news.`
        : `It is ${percent(best.share, 0)} of what you hold.`,
      ...FILM_DAYS.filter((d) => d.news && d.news.ticker !== best.ticker).map(
        (d) => `${d.news!.company}'s news on ${d.day} helped too.`
      ),
    ],
  };
}

/* ---------------------------------------------------------- the picture */

/**
 * The picture's scale: every move of the week, the market and the
 * portfolio's own day, with a little room either side, rounded out to half
 * a percent. Fixed across the three days on purpose, so a chip that moves
 * on screen moved in the numbers too.
 */
export const FILM_DOMAIN = (() => {
  const all = FILM_DAYS.flatMap((d) => [
    d.marketPct,
    d.pct,
    ...d.moves.map((m) => m.pct),
  ]);
  const lo = Math.floor((Math.min(0, ...all) - 0.006) * 200) / 200;
  const hi = Math.ceil((Math.max(0, ...all) + 0.006) * 200) / 200;
  return { lo, hi };
})();

/** Where a move sits along the track, 0 at the left edge and 1 at the right. */
export function filmX(pct: number): number {
  const { lo, hi } = FILM_DOMAIN;
  return Math.min(1, Math.max(0, (pct - lo) / (hi - lo)));
}

/** The labelled marks under the track, every two percent across the scale. */
export const FILM_TICKS: readonly number[] = (() => {
  const out: number[] = [];
  for (
    let v = Math.ceil(FILM_DOMAIN.lo * 50) / 50;
    v <= FILM_DOMAIN.hi + 1e-9;
    v += 0.02
  ) {
    out.push(Math.round(v * 100) / 100);
  }
  return out;
})();

/**
 * Lay the chips out on rows above the track so no two touch.
 *
 * In pixels, because a chip is the same width on every screen and the
 * track is not: the first version of the in-app picture spaced its chips by
 * a fraction of the track and printed them through each other on a phone.
 * The chip nearest the market's line takes the bottom row, so the cluster
 * stacks up around the line and the company that broke away sits on its
 * own on the floor of the picture.
 */
export function filmLanes(
  chips: { ticker: string; pct: number; width: number }[],
  trackPx: number,
  marketPct: number,
  gap = 6
): { ticker: string; lane: number; left: number }[] {
  const placed: { ticker: string; lane: number; left: number }[] = [];
  const order = [...chips].sort(
    (a, b) => Math.abs(a.pct - marketPct) - Math.abs(b.pct - marketPct)
  );
  for (const chip of order) {
    const centre = filmX(chip.pct) * trackPx;
    const left = Math.min(
      Math.max(0, centre - chip.width / 2),
      Math.max(0, trackPx - chip.width)
    );
    let lane = 0;
    for (;;) {
      const clash = placed.some((p) => {
        if (p.lane !== lane) return false;
        const w = chips.find((c) => c.ticker === p.ticker)!.width;
        return left < p.left + w + gap && p.left < left + chip.width + gap;
      });
      if (!clash) break;
      lane += 1;
    }
    placed.push({ ticker: chip.ticker, lane, left });
  }
  return placed;
}
