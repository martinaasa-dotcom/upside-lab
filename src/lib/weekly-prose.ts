/**
 * The words in the Sunday letter, written from the numbers alone.
 *
 * There is no model on this path, and that is a decision rather than a
 * fallback. A model was writing these paragraphs until 2026-09-27, and on
 * a real letter it named a company the reader has never owned (Amazon),
 * turned Micron into a company called "Murrow" that does not exist, and
 * described Rocket Lab as a company "which rockets and spacecraft". Every
 * one of those is a confident false statement about somebody's own money,
 * in the one email this product sends, and no prompt makes that
 * impossible. Arithmetic does.
 *
 * So every sentence here is a template filled from `WeeklyLetter`, which is
 * built from the reader's own holdings and nothing else, and the finished
 * text is then checked once more by `proseNamesAreHeld`: any company it
 * names has to be one the reader owns or watches, or the letter is cut back
 * to the one sentence that names nobody.
 *
 * Three rules the templates keep, each from a reader's complaint:
 *
 *  - a company is called by the name people use for it where
 *    `company-names.ts` is sure of one, and by its cashtag otherwise. It is
 *    never described: a reader owns these companies and knows what they do,
 *    and a description is one more thing that can be wrong;
 *  - no sentence refers to the letter's own layout ("not listed in the
 *    moves", "the watchlist shows"). It says what happened, in the order a
 *    person would say it;
 *  - no instruction and no forecast. The letter says where the money went
 *    and never what to do about it.
 */

import { cashtag, currency, signedPercent } from "@/lib/format";
import { companyName, knownCompanyNames } from "@/lib/company-names";
import type { WeeklyLetter } from "@/lib/weekly-letter";

/* ------------------------------------------------------------ wording */

/** Under this, a week's move on one company is nothing to report. */
const QUIET_PCT = 2;

/** A move big enough to be named beside the week's leader. */
const ALONGSIDE_PCT = 5;

/** A move worth less than this share of the week barely changed the total. */
const SMALL_SHARE = 0.15;

/** Under this, the week is too small for any one company to have caused it. */
const FLAT_WEEK_PCT = 1;

/**
 * Within this many percentage points of the index, the portfolio moved with
 * the market. A point is about the smallest gap a reader would call a
 * difference in a week, and it keeps an ordinary week from being narrated
 * as a triumph or a failure over a few tenths.
 */
const WITH_MARKET_PTS = 1;

/** How the letter says a company: its everyday name, else its cashtag. */
export function said(ticker: string): string {
  return companyName(ticker) ?? cashtag(ticker);
}

/** A percent with no sign, one decimal: "14.5%". */
function pct(p: number): string {
  return signedPercent(Math.abs(p) / 100, 1).replace(/^[+-]/, "");
}

/** Whole dollars with no sign: "$16,077". */
function dollars(n: number): string {
  return currency(Math.abs(n), 0);
}

/** Percentage points with no sign: "5.2 points". */
function points(p: number): string {
  const v = Math.abs(p).toFixed(1);
  return `${v} ${v === "1.0" ? "point" : "points"}`;
}

const WORDS = [
  "no", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

/** Small counts are words in prose: "four rose", never "4 rose". */
function count(n: number): string {
  return WORDS[n] ?? String(n);
}

function rose(p: number): string {
  return p >= 0 ? "rose" : "fell";
}

function upDown(p: number): string {
  return p >= 0 ? "up" : "down";
}

/* ------------------------------------------------------ the three paragraphs */

type Named = Set<string>;

/**
 * The money, and the company that did the most of it.
 */
function weekParagraph(r: WeeklyLetter, named: Named): string {
  const bits: string[] = [];
  const per100 =
    r.weekPct != null
      ? `, about ${currency(Math.abs(r.weekPct), 2)} for every $100 you had invested`
      : "";

  if (r.weekDollar === 0) {
    bits.push("Your portfolio finished the week exactly where it started.");
  } else if (r.quiet) {
    bits.push(
      `Your portfolio finished the week ${r.weekDollar < 0 ? "down" : "up"} ${dollars(r.weekDollar)}${per100}, which is close to flat.`
    );
  } else {
    bits.push(
      `Your portfolio ${r.weekDollar < 0 ? "lost" : "gained"} ${dollars(r.weekDollar)} this week${per100}.`
    );
  }

  // Who did the work is a money question: a 20% week on a small holding is
  // not what changed the total, so the leader is picked by dollars.
  const byDollar = [...r.movers].sort((a, b) => Math.abs(b.dollar) - Math.abs(a.dollar));
  const leader = byDollar.find((m) => m.dollar !== 0);
  if (!leader) return bits.join(" ");

  named.add(leader.ticker);
  const nearFlat = Math.abs(r.weekPct ?? 0) < FLAT_WEEK_PCT;
  const sameWay = Math.sign(leader.dollar) === Math.sign(r.weekDollar);
  const share = r.weekDollar !== 0 ? Math.abs(leader.dollar) / Math.abs(r.weekDollar) : 0;

  if (nearFlat || !sameWay) {
    // On a near-flat week "most of that came from" is a ratio over almost
    // nothing, so it only says which company moved the most money.
    bits.push(
      `The biggest move in money was ${said(leader.ticker)}, ${upDown(leader.pct)} ${pct(leader.pct)}, which ${leader.dollar < 0 ? "took off" : "added"} ${dollars(leader.dollar)}.`
    );
  } else if (share >= 0.5 && share <= 1.05) {
    bits.push(
      `Most of that came from ${said(leader.ticker)}, ${upDown(leader.pct)} ${pct(leader.pct)}, which ${leader.dollar < 0 ? "took off" : "added"} ${dollars(leader.dollar)} on its own.`
    );
  } else if (share > 1.05) {
    bits.push(
      `${said(leader.ticker)} did more than all of it, ${upDown(leader.pct)} ${pct(leader.pct)} and ${leader.dollar < 0 ? "taking off" : "adding"} ${dollars(leader.dollar)} on its own.`
    );
  } else {
    bits.push(
      `${said(leader.ticker)} did the most, ${upDown(leader.pct)} ${pct(leader.pct)}, which ${leader.dollar < 0 ? "took off" : "added"} ${dollars(leader.dollar)}.`
    );
  }

  // A second big move in the same direction belongs in the same breath.
  const alongside = byDollar.find(
    (m) =>
      !named.has(m.ticker) &&
      m.dollar !== 0 &&
      Math.sign(m.pct) === Math.sign(leader.pct) &&
      Math.abs(m.pct) >= ALONGSIDE_PCT
  );
  if (alongside) {
    named.add(alongside.ticker);
    bits.push(
      `${said(alongside.ticker)} ${rose(alongside.pct)} ${pct(alongside.pct)} as well, ${alongside.dollar < 0 ? "taking off" : "adding"} another ${dollars(alongside.dollar)}.`
    );
  }
  return bits.join(" ");
}

/**
 * What went the other way, then everything owned that has not been named,
 * said as a count and one example rather than as an average.
 */
function restParagraph(r: WeeklyLetter, named: Named): string | null {
  const bits: string[] = [];
  const up = r.weekDollar >= 0;
  // Said once, at the end, unless the count below already says it.
  let noneOpposite = false;

  // Every holding with a week, named or not: the movers carry their own
  // figures and `rest` carries the ones beyond them as counts.
  const moverOpposite = [...r.movers]
    .filter((m) => !named.has(m.ticker) && (up ? m.pct < 0 : m.pct > 0))
    .sort((a, b) => Math.abs(b.dollar) - Math.abs(a.dollar));
  const opposite = moverOpposite[0];
  const oppositeTotal =
    r.movers.filter((m) => (up ? m.pct < 0 : m.pct > 0)).length +
    (up ? (r.rest?.down ?? 0) : (r.rest?.up ?? 0));

  if (r.movers.length > 0 && !r.quiet) {
    if (opposite) {
      named.add(opposite.ticker);
      const small =
        r.weekDollar !== 0 && Math.abs(opposite.dollar) < Math.abs(r.weekDollar) * SMALL_SHARE;
      const effect =
        opposite.dollar === 0
          ? ""
          : small
            ? `, which ${opposite.dollar < 0 ? "cost" : "made back"} just ${dollars(opposite.dollar)}`
            : `, which ${opposite.dollar < 0 ? "took" : "put"} ${dollars(opposite.dollar)} ${opposite.dollar < 0 ? "back off" : "back on"}`;
      bits.push(
        oppositeTotal === 1
          ? `The one company you own that went the other way was ${said(opposite.ticker)}, ${upDown(opposite.pct)} ${pct(opposite.pct)}${effect}.`
          : `The biggest move the other way was ${said(opposite.ticker)}, ${upDown(opposite.pct)} ${pct(opposite.pct)}${effect}.`
      );
    } else if (oppositeTotal === 0 && r.weekDollar !== 0) {
      noneOpposite = true;
    }
  }

  // Everything owned and not yet named, as one plain count.
  const left: { ticker: string; pct: number }[] = r.movers
    .filter((m) => !named.has(m.ticker))
    .map((m) => ({ ticker: m.ticker, pct: m.pct }));
  let leftUp = left.filter((m) => m.pct > 0).length;
  let leftDown = left.filter((m) => m.pct < 0).length;
  let total = left.length;
  if (r.rest) {
    total += r.rest.count;
    leftUp += r.rest.up;
    leftDown += r.rest.down;
    left.push({ ticker: r.rest.maxTicker, pct: r.rest.maxPct });
  }
  if (total > 0 && left.length > 0) {
    const biggest = left.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a));
    const other = named.size > 0 ? "other " : "";
    const companies = total === 1 ? "company" : "companies";
    if (total === 1) {
      bits.push(
        Math.abs(biggest.pct) < QUIET_PCT
          ? `${said(biggest.ticker)} barely moved, ${upDown(biggest.pct)} ${pct(biggest.pct)}.`
          : `${said(biggest.ticker)} ${rose(biggest.pct)} ${pct(biggest.pct)}.`
      );
    } else if (Math.abs(biggest.pct) < QUIET_PCT) {
      bits.push(
        `Your ${other}${count(total)} ${companies} barely moved; none went more than ${pct(biggest.pct)} either way.`
      );
    } else if (leftDown === 0 || leftUp === 0) {
      const verb = leftDown === 0 ? "rose" : "fell";
      const too = noneOpposite ? " too" : "";
      noneOpposite = false;
      bits.push(
        total === 2
          ? `Your ${other}two companies both ${verb}${too}; ${said(biggest.ticker)} ${verb} further, by ${pct(biggest.pct)}.`
          : `Your ${other}${count(total)} ${companies} all ${verb}${too}, ${said(biggest.ticker)} the most at ${pct(biggest.pct)}.`
      );
    } else {
      const flat = total - leftUp - leftDown;
      bits.push(
        `Of your ${other}${count(total)} ${companies}, ${count(leftUp)} rose and ${count(leftDown)} fell${
          flat > 0 ? `, and ${count(flat)} did not move` : ""
        }. The largest of those moves was ${said(biggest.ticker)}, ${upDown(biggest.pct)} ${pct(biggest.pct)}.`
      );
    }
  }
  if (noneOpposite) bits.push(`Nothing you own finished the week ${up ? "lower" : "higher"}.`);
  return bits.length > 0 ? bits.join(" ") : null;
}

/**
 * The watchlist in one or two sentences, both directions, biggest first.
 */
function watchParagraph(r: WeeklyLetter): string | null {
  const rows = r.watchRows.filter((w) => Number.isFinite(w.pct));
  if (rows.length === 0) return null;
  const ups = rows.filter((w) => w.pct > 0).sort((a, b) => b.pct - a.pct);
  const downs = rows.filter((w) => w.pct < 0).sort((a, b) => a.pct - b.pct);
  const at = (w: { ticker: string; pct: number }) => `${said(w.ticker)} at ${pct(w.pct)}`;

  if (rows.length === 1) {
    const w = rows[0];
    return w.pct === 0
      ? `${said(w.ticker)}, the one company on your watchlist, did not move.`
      : `${said(w.ticker)}, the one company on your watchlist, ${rose(w.pct)} ${pct(w.pct)}.`;
  }
  if (ups.length > 0 && downs.length > 0) {
    if (ups.length === 1 && downs.length === 1) {
      return `On your watchlist, ${said(ups[0].ticker)} rose ${pct(ups[0].pct)} and ${said(downs[0].ticker)} fell ${pct(downs[0].pct)}.`;
    }
    return `On your watchlist, the biggest rise was ${said(ups[0].ticker)} at ${pct(ups[0].pct)} and the biggest fall ${said(downs[0].ticker)} at ${pct(downs[0].pct)}.`;
  }
  const oneWay = ups.length > 0 ? ups : downs;
  if (oneWay.length > 0) {
    const tail = oneWay.slice(1, 3).map(at);
    const verb = ups.length > 0 ? "rose" : "fell";
    if (tail.length === 0) {
      return `On your watchlist, ${said(oneWay[0].ticker)} ${verb} ${pct(oneWay[0].pct)} and nothing else moved.`;
    }
    const lead =
      oneWay.length === rows.length
        ? `Everything on your watchlist ${verb}, ${said(oneWay[0].ticker)} the most at ${pct(oneWay[0].pct)}`
        : `On your watchlist, ${said(oneWay[0].ticker)} ${verb} the most, ${pct(oneWay[0].pct)}`;
    return `${lead}, then ${
      tail.length === 2 ? `${tail[0]} and ${tail[1]}` : tail[0]
    }.`;
  }
  return "Nothing on your watchlist moved.";
}

/* --------------------------------------------------- you or the market */

/**
 * The answer to the one question every Sunday should settle: was this week
 * the market, or was it your companies?
 *
 * It is arithmetic, and exact. The portfolio's week is a weighted sum of
 * its companies' weeks, so the gap between it and the index splits cleanly
 * into what each company did beyond the index, weighted by how much of the
 * portfolio it was on Friday (`WeeklyMarket.drivers`). And "had your money
 * simply followed the index" is the same starting value times the index's
 * week, which is a counterfactual anybody can check, not a claim about how
 * the portfolio behaves.
 */
export function marketParagraph(r: WeeklyLetter): string | null {
  const m = r.market;
  if (!m || r.weekPct == null) return null;
  // Everything is compared at the one decimal place it is printed at, so
  // the gap in the sentence is always the difference of the two figures in it.
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const p = round1(r.weekPct);
  const mp = round1(m.pct);
  const gap = round1(p - mp);
  const bits: string[] = [];

  const index = `The S&P 500, the index of America's five hundred largest companies,`;
  const indexDid = mp === 0 ? "was flat" : `${rose(mp)} ${pct(mp)}`;
  const youDid = p === 0 ? "was flat" : `${rose(p)} ${pct(p)}`;
  const followed = m.followedDollar;
  const couldHave =
    followed === 0
      ? "the week would have come to nothing either way"
      : `the week would have ${followed < 0 ? "cost you" : "made you"} ${dollars(followed)}`;
  const instead =
    r.weekDollar === 0
      ? "rather than nothing"
      : `rather than the ${dollars(r.weekDollar)} it actually ${r.weekDollar < 0 ? "cost" : "made"}`;

  if (Math.abs(gap) < WITH_MARKET_PTS) {
    bits.push(`${index} ${indexDid} this week, and your portfolio ${youDid}.`);
    bits.push(
      `That is close enough to call it the market's week rather than your companies': had your money simply followed the index, ${couldHave}${
        Math.abs(r.weekDollar - followed) >= 1 ? `, ${instead}` : ""
      }.`
    );
    return bits.join(" ");
  }

  const ahead = gap > 0;
  if (Math.sign(p) !== Math.sign(mp) && p !== 0 && mp !== 0) {
    bits.push(
      `${index} ${indexDid} this week, while your portfolio ${youDid}. So this was your companies' doing, not the market's.`
    );
  } else {
    bits.push(
      `${index} ${indexDid} this week. Your portfolio ${youDid}, ${points(gap)} ${ahead ? "ahead of" : "behind"} it.`
    );
  }
  bits.push(`Had your money simply followed the index, ${couldHave}, ${instead}.`);

  // Which companies opened the gap: the ones that pushed the same way as
  // the gap, by how much each pushed.
  const pushers = m.drivers
    .filter((d) => Math.sign(d.gapPts) === Math.sign(gap) && Math.abs(d.gapPts) > 0)
    .sort((a, b) => Math.abs(b.gapPts) - Math.abs(a.gapPts));
  const first = pushers[0];
  const second = pushers[1];
  const cover = (d: { gapPts: number }) => Math.abs(d.gapPts) / Math.abs(gap);
  if (first && cover(first) >= 0.3) {
    const one = `${said(first.ticker)}, ${upDown(first.pct)} ${pct(first.pct)}`;
    if (cover(first) < 0.6 && second && cover(second) >= 0.2) {
      bits.push(
        `Most of the difference came from ${one}, and ${said(second.ticker)}, ${upDown(second.pct)} ${pct(second.pct)}.`
      );
    } else {
      bits.push(`Most of the difference came from ${one}.`);
    }
  } else if (pushers.length > 0) {
    bits.push(
      `No single company made the difference; it came from ${
        pushers.length === 1 ? "one small move" : `${count(pushers.length)} of your companies together`
      }.`
    );
  }
  return bits.join(" ");
}

/* -------------------------------------------------------------- the guard */

/**
 * Every company the text names is one the reader owns or watches.
 *
 * The templates above can only name tickers out of the letter, so this is
 * true by construction today; it is here so that the day somebody adds a
 * sentence that is not, the letter refuses rather than names a company in
 * somebody's inbox that they do not own. It checks both spellings a
 * company can take in this letter: a `$CASHTAG`, and any everyday name
 * `company-names.ts` knows, mapped back to its tickers.
 */
export function proseNamesAreHeld(
  text: string,
  allowed: ReadonlySet<string>
): { ok: true } | { ok: false; stray: string } {
  const up = new Set([...allowed].map((t) => t.toUpperCase()));
  for (const match of text.matchAll(/\$([A-Z][A-Z0-9.-]{0,9})\b/g)) {
    if (!up.has(match[1])) return { ok: false, stray: match[0] };
  }
  for (const { name, tickers, re } of namePatterns()) {
    if (re.test(text) && !tickers.some((t) => up.has(t))) {
      return { ok: false, stray: name };
    }
  }
  return { ok: true };
}

let patterns: { name: string; tickers: string[]; re: RegExp }[] | null = null;

/** Every known name as a whole-word pattern, compiled once. */
function namePatterns() {
  patterns ??= knownCompanyNames().map(({ name, tickers }) => ({
    name,
    tickers,
    re: new RegExp(`(^|[^A-Za-z&'])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`),
  }));
  return patterns;
}

/** Every ticker the letter itself is about. */
export function letterTickers(r: WeeklyLetter): Set<string> {
  return new Set(
    [
      ...r.movers.map((m) => m.ticker),
      ...(r.rest ? [r.rest.maxTicker] : []),
      ...r.watchRows.map((w) => w.ticker),
      ...(r.market?.drivers.map((d) => d.ticker) ?? []),
      ...r.heldTickers,
    ].map((t) => t.toUpperCase())
  );
}

/** The paragraphs at the top of the letter. */
export function writeWeeklyProse(r: WeeklyLetter): string {
  const named: Named = new Set();
  const paras = [weekParagraph(r, named), restParagraph(r, named), watchParagraph(r)].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  const text = paras.join("\n\n");
  const verdict = proseNamesAreHeld(text, letterTickers(r));
  if (!verdict.ok) {
    console.error("Sunday letter prose named a company the reader does not hold", verdict.stray);
    return firstSentence(r);
  }
  return text;
}

/** The market section's paragraph, under the same guard. */
export function writeMarketProse(r: WeeklyLetter): string | null {
  const text = marketParagraph(r);
  if (!text) return null;
  const verdict = proseNamesAreHeld(text, letterTickers(r));
  if (!verdict.ok) {
    console.error("Sunday letter market paragraph named a company the reader does not hold", verdict.stray);
    return null;
  }
  return text;
}

/** The one sentence that names no company, for a letter that failed the guard. */
function firstSentence(r: WeeklyLetter): string {
  if (r.weekDollar === 0) return "Your portfolio finished the week exactly where it started.";
  return `Your portfolio ${r.weekDollar < 0 ? "lost" : "gained"} ${dollars(r.weekDollar)} this week.`;
}
