import {
  groupSplitFact,
  loneMoverFact,
  mixDayFact,
  neighborGapsToday,
  type InsightHolding,
} from "@/lib/book-insights";
import { loadConvictionMap } from "@/lib/conviction";
import { cashtag, signedCurrency } from "@/lib/format";
import { forecastThemeForTicker } from "@/lib/forecast-conviction";
import {
  insightFingerprint,
  type InsightLook,
} from "@/lib/insight-look";
import {
  insightWhen,
  isUsAfterCashClose,
  isUsWeekend,
  type SessionKind,
} from "@/lib/market-session";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";
import { isMoveRestatement, loadPulseTickerCache } from "@/lib/thesis-pulse";
import type { OverviewModel, TickerScore } from "@/lib/overview";
import type { VisitDiff } from "@/lib/visit-diff";
import { loadWeekMarks } from "@/lib/week-marks";
import { todayKeyInTz } from "@/lib/timezone";

export type MorningDriver = {
  ticker: string;
  dollar: number;
  share: number | null;
};

export type SundayName = {
  ticker: string;
  pct: number;
};

export type SundayRecap = {
  best: SundayName | null;
  worst: SundayName | null;
};

/**
 * Where a Home notice came from.
 *
 * Only two of these are worth printing. A card that says a number was
 * worked out from your own holdings at today's prices is saying the one
 * thing the reader already assumed, on a page called Today, four times per
 * screen, and a line everybody skips is a line nobody reads the day it
 * matters. What is not obvious is a card quoting a Pulse reading or
 * comparing against the last time you were here, so those two still say so
 * and "holdings" prints nothing.
 */
export type MorningSource = "holdings" | "pulse" | "visit";

export function morningSourceLabel(source: MorningSource): string | null {
  if (source === "pulse") {
    return "From the Pulse reading you already have on this name.";
  }
  if (source === "visit") {
    return "Against what your numbers were last time you looked.";
  }
  return null;
}

export type MorningNotice = {
  id: string;
  fingerprint: string;
  label: string;
  text: string;
  /** notice = an observation. gap = something missing worth acting on.
   * Lets the two render as visibly different kinds of read, not just
   * different labels on the same box. */
  kind: "notice" | "gap";
  source: MorningSource;
  /** Set only when the card is about one company, so it can offer Pulse. */
  ticker?: string;
};

export type MorningRead = {
  quiet: boolean;
  sentence: string;
  notices: MorningNotice[];
  awayLines: VisitDiff["lines"];
  drivers: MorningDriver[];
  afterClose: boolean;
  sunday: SundayRecap | null;
  moveLabel: "Today" | "Friday";
};

export type HomePulseNote = {
  ticker: string;
  thesisStatus?: string | null;
  hasThesis: boolean;
  moveReason?: string | null;
};

export type MorningReadExtras = {
  lookIndex?: number;
  notes?: HomePulseNote[];
  shown?: Iterable<string>;
  sittingLock?: Pick<InsightLook, "noticeId" | "gapId">;
};

type Candidate = {
  id: string;
  subject: string;
  fingerprint: string;
  kind: "notice" | "gap";
  rank: number;
  label?: string;
  text: string;
  /** Defaults to "holdings", which is what all but a handful of these are. */
  source?: MorningSource;
  ticker?: string;
};

function holdingsFrom(model: OverviewModel): InsightHolding[] {
  return model.tickers.map((t) => ({
    ticker: t.ticker,
    value: t.currentValue,
    todayPct: t.todayPct,
    todayDollar: t.todayDollar,
  }));
}

function aboutMove(pct: number): string {
  return `about ${Math.max(1, Math.round(Math.abs(pct) * 100))}%`;
}

function sharePct(pct: number): string {
  return `${Math.max(1, Math.round(pct * 100))}%`;
}

function tail(when: "today" | "friday"): string {
  return when === "friday" ? "on Friday" : "today";
}

function say(seed: string, lines: string[]): string {
  return pick(mulberry32(hashSeed(seed)), lines);
}

function oneSentence(text: string): string | null {
  const one = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0];
  if (!one) return null;
  if (one.length > 160) {
    const cut = one.slice(0, 157).replace(/\s+\S*$/, "");
    return cut ? `${cut}.` : null;
  }
  return one.endsWith(".") || one.endsWith("!") || one.endsWith("?")
    ? one
    : `${one}.`;
}

function daySentence(
  model: OverviewModel,
  weekend: boolean
): { quiet: boolean; sentence: string } {
  if (weekend) {
    return {
      quiet: true,
      sentence: "US markets are closed. These are Friday's numbers.",
    };
  }
  const pct = model.totals.todayPct;
  if (pct == null) {
    return { quiet: true, sentence: "Prices are still coming in." };
  }
  const dollars = signedCurrency(model.totals.todayDollar, 0);
  const swing = Math.abs(pct);
  if (swing < 0.005) {
    return { quiet: true, sentence: "Quiet day. Your portfolio barely moved." };
  }
  if (swing < 0.02) {
    return {
      quiet: true,
      sentence: `Small move, ${dollars}. Nothing you have to do.`,
    };
  }
  return {
    quiet: false,
    sentence: pickSwingSentence(dollars),
  };
}

/** Rotates through a few plain-English phrasings so the reading doesn't
 * repeat the exact same sentence every time. Picked off the day of the
 * year so it's stable within a day, not flickering on every render. */
function pickSwingSentence(dollars: string): string {
  const variations = [
    "Your portfolio's value moved mostly because of the holdings below.",
    "A few holdings did most of the moving today. They're listed below.",
    "Here's what moved your total today.",
    `${dollars} today, mostly from the holdings below.`,
    "These holdings moved your total the most today.",
  ];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      86400000
  );
  return variations[dayOfYear % variations.length];
}

function driversFor(model: OverviewModel): MorningDriver[] {
  const swing = model.tickers.reduce(
    (s, t) => s + Math.abs(t.todayDollar),
    0
  );
  return [...model.tickers]
    .sort((a, b) => Math.abs(b.todayDollar) - Math.abs(a.todayDollar))
    .filter((t) => Math.abs(t.todayDollar) >= 1)
    .slice(0, 3)
    .map((t) => ({
      ticker: t.ticker,
      dollar: t.todayDollar,
      share: swing >= 50 ? Math.abs(t.todayDollar) / swing : null,
    }));
}

export function buildSundayRecap(model: OverviewModel): SundayRecap | null {
  if (model.tickers.length === 0) return null;
  const week = loadWeekMarks();
  const liveBest = [...model.tickers].sort(
    (a, b) => (b.todayPct ?? -99) - (a.todayPct ?? -99)
  )[0];
  const liveWorst = [...model.tickers].sort(
    (a, b) => (a.todayPct ?? 99) - (b.todayPct ?? 99)
  )[0];
  const weekBest = [...week.days]
    .filter((d) => d.bestTicker && d.bestPct != null)
    .sort((a, b) => (b.bestPct ?? -99) - (a.bestPct ?? -99))[0];
  const weekWorst = [...week.days]
    .filter((d) => d.worstTicker && d.worstPct != null)
    .sort((a, b) => (a.worstPct ?? 99) - (b.worstPct ?? 99))[0];
  const bestTicker = weekBest?.bestTicker ?? liveBest?.ticker ?? null;
  const bestPct = weekBest?.bestPct ?? liveBest?.todayPct ?? null;
  const worstTicker = weekWorst?.worstTicker ?? liveWorst?.ticker ?? null;
  const worstPct = weekWorst?.worstPct ?? liveWorst?.todayPct ?? null;
  const best =
    bestTicker && bestPct != null ? { ticker: bestTicker, pct: bestPct } : null;
  const worst =
    worstTicker && worstPct != null && worstTicker !== bestTicker
      ? { ticker: worstTicker, pct: worstPct }
      : null;
  return {
    best,
    worst,
  };
}

function isSundayTallinn(now = new Date()): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Tallinn",
    weekday: "short",
  }).format(now);
  return wd === "Sun";
}

function seedFor(lookIndex: number, id: string): string {
  return `upside-update|${todayKeyInTz()}|${lookIndex}|${id}`;
}

function awayCandidate(visitDiff: VisitDiff | null): Candidate | null {
  if (!visitDiff) return null;
  const tickerLine = visitDiff.lines.find((l) => l.id.startsWith("t-"));
  if (tickerLine) {
    const subject = tickerLine.id.replace(/^t-/, "").replace(/^\$/, "");
    return {
      id: `away-${visitDiff.previousAt}`,
      subject,
      fingerprint: insightFingerprint(
        "away",
        `${subject}|${visitDiff.previousAt.slice(0, 16)}`,
        0.02
      ),
      kind: "notice",
      rank: 95,
      source: "visit",
      ticker: subject,
      label: "Since you looked",
      text: say(`away|${visitDiff.previousAt}`, [
        `Since you last looked, ${tickerLine.text}. That is the first thing to know.`,
        `${tickerLine.text} while you were away. The rest can wait.`,
        `New since you opened this last: ${tickerLine.text}.`,
      ]),
    };
  }
  const nav = visitDiff.lines.find((l) => l.id === "nav");
  if (!nav) return null;
  return {
    id: `away-nav-${visitDiff.previousAt}`,
    subject: "nav",
    fingerprint: insightFingerprint(
      "away",
      `nav|${visitDiff.previousAt.slice(0, 16)}`,
      0.02
    ),
    kind: "notice",
    rank: 88,
    source: "visit",
    label: "Since you looked",
    text: `${nav.text}. That is since you last opened this, not just today's open.`,
  };
}

function loneCandidate(
  holdings: InsightHolding[],
  when: "today" | "friday",
  lookIndex: number
): Candidate | null {
  const fact = loneMoverFact(holdings);
  if (!fact) return null;
  const t = cashtag(fact.ticker);
  const move = aboutMove(fact.pct);
  const whenTail = tail(when);
  const otherNames = fact.others.map((o) => cashtag(o.ticker));
  const vs =
    fact.othersQuiet && otherNames.length === 2
      ? `${otherNames[0]} and ${otherNames[1]} have barely moved`
      : fact.othersQuiet && otherNames.length === 1
        ? `${otherNames[0]} has barely moved`
        : `the rest of your names are roughly ${fact.restPct >= 0 ? "flat to slightly up" : "flat to slightly down"}`;
  const up = fact.pct >= 0;
  const id = `lone-${fact.ticker}`;
  return {
    id,
    subject: fact.ticker,
    fingerprint: insightFingerprint("lone", fact.ticker, fact.pct),
    kind: "notice",
    rank: 82,
    ticker: fact.ticker,
    text: say(seedFor(lookIndex, id), [
      `${t} is ${up ? "up" : "down"} ${move} ${whenTail}. ${vs}.`,
      `Quick note: ${t} did ${move} ${whenTail} on its own. ${vs}.`,
      `${t} just moved ${move}. Nothing else in the portfolio is doing that.`,
    ]),
  };
}

function groupsCandidate(
  holdings: InsightHolding[],
  when: "today" | "friday",
  lookIndex: number
): Candidate | null {
  const split = groupSplitFact(holdings);
  if (!split) return null;
  const down = split.downTicker
    ? `${cashtag(split.downTicker)} and the other ${split.downLabel}`
    : split.downLabel;
  const up = split.upTicker
    ? `${cashtag(split.upTicker)} and the other ${split.upLabel}`
    : split.upLabel;
  const whenTail = tail(when);
  const downMove =
    split.downPct >= 0
      ? `up ${aboutMove(split.downPct)}`
      : `down ${aboutMove(split.downPct)}`;
  const upMove =
    split.upPct >= 0
      ? `up ${aboutMove(split.upPct)}`
      : `down ${aboutMove(split.upPct)}`;
  const id = `groups-${split.downTheme}-${split.upTheme}`;
  return {
    id,
    subject: `${split.downTheme}|${split.upTheme}`,
    fingerprint: insightFingerprint(
      "groups",
      `${split.downTheme}|${split.upTheme}`,
      split.upPct - split.downPct
    ),
    kind: "notice",
    rank: 78,
    text: say(seedFor(lookIndex, id), [
      `${down} ${when === "friday" ? "were" : "are"} ${downMove} ${whenTail}. ${up} ${when === "friday" ? "were" : "are"} ${upMove}.`,
      `Two groups, two speeds: ${split.downLabel} ${downMove}, ${split.upLabel} ${upMove} ${whenTail}.`,
      split.sameAiStory
        ? `${down} ${downMove} ${whenTail}. ${up} ${upMove}. Same story, not the same names.`
        : `${down} ${downMove}, ${up} ${upMove} ${whenTail}. Those are different parts of the portfolio.`,
    ]),
  };
}

function mixCandidate(
  holdings: InsightHolding[],
  when: "today" | "friday",
  lookIndex: number
): Candidate | null {
  const fact = mixDayFact(holdings);
  if (!fact) return null;
  const whenTail = tail(when);
  const lead = fact.loud
    ? `${cashtag(fact.loud)} and the other ${fact.plain}`
    : fact.plain;
  const id = `mix-${fact.label}`;
  return {
    id,
    subject: fact.label,
    fingerprint: insightFingerprint("mix", fact.label, fact.pct),
    kind: "notice",
    rank: 50,
    text: say(seedFor(lookIndex, id), [
      `${lead} ${when === "friday" ? "were" : "are"} ${fact.pct >= 0 ? "up" : "down"} ${aboutMove(fact.pct)} ${whenTail}. That group is ${sharePct(fact.share)} of the portfolio, so this is a ${fact.plain} day for you.`,
      `Most of the portfolio is ${fact.label} (${sharePct(fact.share)}). They moved ${aboutMove(fact.pct)} ${whenTail}.`,
    ]),
  };
}

function weekReversal(
  model: OverviewModel,
  when: "today" | "friday",
  lookIndex: number
): Candidate | null {
  if (when === "friday") return null;
  const week = loadWeekMarks();
  const dayKey = todayKeyInTz();
  const prior = week.days.filter(
    (d) => d.dayKey !== dayKey && d.bestTicker && d.bestPct != null
  );
  if (prior.length === 0) return null;
  const best = [...prior].sort(
    (a, b) => (b.bestPct ?? 0) - (a.bestPct ?? 0)
  )[0];
  if (!best?.bestTicker) return null;
  const t = model.tickers.find((x) => x.ticker === best.bestTicker);
  if (!t || t.todayPct == null || t.todayPct > -0.02) return null;
  const id = `reversal-${t.ticker}`;
  return {
    id,
    subject: t.ticker,
    fingerprint: insightFingerprint("reversal", t.ticker, t.todayPct),
    kind: "notice",
    rank: 68,
    ticker: t.ticker,
    text: say(seedFor(lookIndex, id), [
      `${cashtag(t.ticker)} led earlier this week, and it is down ${aboutMove(t.todayPct)} today.`,
      `${cashtag(t.ticker)} was the week's winner. Today it fell ${aboutMove(t.todayPct)}.`,
    ]),
  };
}

function sparkExtreme(t: TickerScore): "high" | "low" | null {
  const s = t.sparkline.filter((n) => Number.isFinite(n));
  if (s.length < 8) return null;
  const last = s[s.length - 1]!;
  const max = Math.max(...s);
  const min = Math.min(...s);
  const range = max - min;
  if (range <= 0) return null;
  const pct = t.todayPct ?? 0;
  if (last >= max - range * 0.04 && pct > 0.015) return "high";
  if (last <= min + range * 0.04 && pct < -0.015) return "low";
  return null;
}

function sparkCandidates(
  model: OverviewModel,
  when: "today" | "friday",
  lookIndex: number
): Candidate[] {
  const whenTail = tail(when);
  const out: Candidate[] = [];
  for (const t of model.tickers) {
    if (t.todayPct == null) continue;
    const ext = sparkExtreme(t);
    if (!ext) continue;
    const id = `spark-${t.ticker}-${ext}`;
    out.push({
      id,
      subject: t.ticker,
      fingerprint: insightFingerprint(`spark-${ext}`, t.ticker, t.todayPct),
      kind: "notice",
      rank: 76,
      ticker: t.ticker,
      text:
        ext === "high"
          ? say(seedFor(lookIndex, id), [
              `${cashtag(t.ticker)} is at the high of its recent stretch, up ${aboutMove(t.todayPct)} ${whenTail}.`,
              `${cashtag(t.ticker)} just tagged the top of the recent path. Up ${aboutMove(t.todayPct)} ${whenTail}.`,
            ])
          : say(seedFor(lookIndex, id), [
              `${cashtag(t.ticker)} is at the low of its recent stretch, down ${aboutMove(t.todayPct)} ${whenTail}.`,
              `${cashtag(t.ticker)} just tagged the bottom of the recent path. Down ${aboutMove(t.todayPct)} ${whenTail}.`,
            ]),
    });
  }
  return out;
}

function dollarCandidate(
  model: OverviewModel,
  skipTicker: string | null,
  when: "today" | "friday",
  lookIndex: number
): Candidate | null {
  const swing = model.tickers.reduce((s, t) => s + Math.abs(t.todayDollar), 0);
  if (swing < 400) return null;
  const top = [...model.tickers].sort(
    (a, b) => Math.abs(b.todayDollar) - Math.abs(a.todayDollar)
  )[0];
  if (!top || Math.abs(top.todayDollar) < 400) return null;
  if (skipTicker && top.ticker === skipTicker) return null;
  const share = Math.abs(top.todayDollar) / swing;
  if (share < 0.45) return null;
  const id = `dollar-${top.ticker}`;
  const money = signedCurrency(top.todayDollar, 0);
  const whenTail = tail(when);
  return {
    id,
    subject: top.ticker,
    fingerprint: insightFingerprint(
      "dollar",
      top.ticker,
      top.todayPct ?? share
    ),
    kind: "notice",
    rank: 74,
    ticker: top.ticker,
    text: say(seedFor(lookIndex, id), [
      `${cashtag(top.ticker)} is ${money} of today's move, most of it. ${whenTail === "today" ? "That is the day." : "That was Friday."}`,
      `The dollar move is ${cashtag(top.ticker)} (${money}). Everything else is small next to that.`,
    ]),
  };
}

function breadthCandidate(
  model: OverviewModel,
  when: "today" | "friday",
  lookIndex: number
): Candidate | null {
  const live = model.tickers.filter((t) => t.todayPct != null);
  if (live.length < 4) return null;
  const down = live.filter((t) => (t.todayPct ?? 0) < -0.005).length;
  const up = live.filter((t) => (t.todayPct ?? 0) > 0.005).length;
  const n = live.length;
  if (down / n < 0.7 && up / n < 0.7) return null;
  const wideDown = down / n >= 0.7;
  const id = wideDown ? "breadth-down" : "breadth-up";
  const mag = wideDown ? down / n : up / n;
  return {
    id,
    subject: "breadth",
    fingerprint: insightFingerprint(id, "book", mag),
    kind: "notice",
    rank: 64,
    text: say(seedFor(lookIndex, id), wideDown
      ? [
          `${down} of ${n} names are down ${tail(when)}. This is a wide day, not one ticker.`,
          `Almost everything you own is red ${tail(when)} (${down} of ${n}).`,
        ]
      : [
          `${up} of ${n} names are up ${tail(when)}. This is a wide day, not one ticker.`,
          `Almost everything you own is green ${tail(when)} (${up} of ${n}).`,
        ]),
  };
}

function pairCandidate(
  model: OverviewModel,
  when: "today" | "friday",
  lookIndex: number
): Candidate | null {
  const live = model.tickers.filter(
    (t) => t.todayPct != null && Number.isFinite(t.todayPct)
  );
  const byTheme = new Map<string, TickerScore[]>();
  for (const t of live) {
    const theme = forecastThemeForTicker(t.ticker);
    const row = byTheme.get(theme) ?? [];
    row.push(t);
    byTheme.set(theme, row);
  }
  let best: { a: TickerScore; b: TickerScore; gap: number } | null = null;
  for (const row of byTheme.values()) {
    if (row.length < 2) continue;
    const sorted = [...row].sort(
      (x, y) => (y.todayPct ?? 0) - (x.todayPct ?? 0)
    );
    const a = sorted[0]!;
    const b = sorted[sorted.length - 1]!;
    const ap = a.todayPct ?? 0;
    const bp = b.todayPct ?? 0;
    if (ap < 0.02 || bp > -0.02) continue;
    const gap = ap - bp;
    if (gap < 0.04) continue;
    if (!best || gap > best.gap) best = { a, b, gap };
  }
  if (!best) return null;
  const id = `pair-${best.a.ticker}-${best.b.ticker}`;
  return {
    id,
    subject: `${best.a.ticker}|${best.b.ticker}`,
    fingerprint: insightFingerprint("pair", id, best.gap),
    kind: "notice",
    rank: 70,
    text: say(seedFor(lookIndex, id), [
      `${cashtag(best.a.ticker)} is up ${aboutMove(best.a.todayPct!)} and ${cashtag(best.b.ticker)} is down ${aboutMove(best.b.todayPct!)} ${tail(when)}. Same group, two different days.`,
      `${cashtag(best.a.ticker)} and ${cashtag(best.b.ticker)} split ${tail(when)}: ${aboutMove(best.a.todayPct!)} up, ${aboutMove(best.b.todayPct!)} down.`,
    ]),
  };
}

function pulseCandidates(
  model: OverviewModel,
  notes: HomePulseNote[] | undefined,
  when: "today" | "friday",
  lookIndex: number
): Candidate[] {
  if (!notes || notes.length === 0) return [];
  const whenTail = tail(when);
  const equity = model.totals.equityValue;
  const byTicker = new Map(
    model.tickers.map((t) => [t.ticker.toUpperCase(), t])
  );
  const out: Candidate[] = [];
  for (const n of notes) {
    const t = byTicker.get(n.ticker.toUpperCase());
    if (!t || t.todayPct == null) continue;
    const status = String(n.thesisStatus ?? "").toLowerCase();
    const big = equity > 0 ? t.currentValue / equity >= 0.1 : false;
    const reason = n.moveReason?.trim() ?? "";
    const why =
      reason && !isMoveRestatement(reason) ? oneSentence(reason) : null;
    if (why && Math.abs(t.todayPct) >= 0.015) {
      const id = `why-${t.ticker}`;
      out.push({
        id,
        subject: t.ticker,
        fingerprint: insightFingerprint("why", t.ticker, t.todayPct),
        kind: "notice",
        rank: 88,
        source: "pulse",
        ticker: t.ticker,
        text: say(seedFor(lookIndex, id), [
          `${cashtag(t.ticker)} is ${t.todayPct >= 0 ? "up" : "down"} ${aboutMove(t.todayPct)} ${whenTail}. Last Pulse read: ${why}`,
          `${cashtag(t.ticker)} moved ${aboutMove(t.todayPct)} ${whenTail}. ${why}`,
        ]),
      });
    }
    if (status === "watch" || status === "broken") {
      if (Math.abs(t.todayPct) < 0.015 && !big) continue;
      const label = status === "broken" ? "Thesis broken" : "Thesis watch";
      const id = `pulse-${t.ticker}`;
      out.push({
        id,
        subject: t.ticker,
        fingerprint: insightFingerprint(`pulse-${status}`, t.ticker, t.todayPct),
        kind: "notice",
        rank: status === "broken" ? 86 : 72,
        source: "pulse",
        ticker: t.ticker,
        text: `${cashtag(t.ticker)} is on ${label}, and it ${t.todayPct >= 0 ? "rose" : "fell"} ${aboutMove(t.todayPct)} ${whenTail}.`,
      });
    }
    if (
      !n.hasThesis &&
      Math.abs(t.todayPct) >= 0.02 &&
      equity > 0 &&
      t.currentValue / equity >= 0.08
    ) {
      const id = `thesis-${t.ticker}`;
      out.push({
        id,
        subject: t.ticker,
        fingerprint: insightFingerprint("thesis", t.ticker, t.todayPct),
        kind: "gap",
        rank: 62,
        ticker: t.ticker,
        text: `${cashtag(t.ticker)} ${t.todayPct >= 0 ? "rose" : "fell"} ${aboutMove(t.todayPct)} ${whenTail}, and there is no thesis on file for it.`,
      });
    }
  }
  return out;
}

function gapCandidates(
  holdings: InsightHolding[],
  when: "today" | "friday",
  lookIndex: number
): Candidate[] {
  const whenTail = tail(when);
  return neighborGapsToday(holdings, when).map((gap) => ({
    id: gap.id,
    subject: gap.id,
    fingerprint: insightFingerprint(gap.id, gap.id, gap.move),
    kind: "gap" as const,
    rank: 55,
    text: say(seedFor(lookIndex, gap.id), [
      `${gap.group} ${when === "friday" ? "were" : "are"} ${gap.move >= 0 ? "up" : "down"} ${aboutMove(gap.move)} ${whenTail}, and they are ${sharePct(gap.share)} of the portfolio. ${gap.closer}`,
      `${gap.group} moved ${aboutMove(gap.move)} ${whenTail}. That is ${sharePct(gap.share)} of what you own. ${gap.closer}`,
    ]),
  }));
}

function liveCandidates(
  model: OverviewModel,
  visitDiff: VisitDiff | null,
  when: "today" | "friday",
  notes: HomePulseNote[] | undefined,
  lookIndex: number
): Candidate[] {
  const holdings = holdingsFrom(model);
  const out: Candidate[] = [];
  const away = awayCandidate(visitDiff);
  if (away) out.push(away);
  const lone = loneCandidate(holdings, when, lookIndex);
  if (lone) out.push(lone);
  const groups = groupsCandidate(holdings, when, lookIndex);
  if (groups) out.push(groups);
  else {
    const mix = mixCandidate(holdings, when, lookIndex);
    if (mix) out.push(mix);
  }
  const reversal = weekReversal(model, when, lookIndex);
  if (reversal) out.push(reversal);
  out.push(...sparkCandidates(model, when, lookIndex));
  const dollar = dollarCandidate(
    model,
    lone?.subject ?? null,
    when,
    lookIndex
  );
  if (dollar) out.push(dollar);
  const breadth = breadthCandidate(model, when, lookIndex);
  if (breadth) out.push(breadth);
  const pair = pairCandidate(model, when, lookIndex);
  if (pair) out.push(pair);
  out.push(...pulseCandidates(model, notes, when, lookIndex));
  out.push(...gapCandidates(holdings, when, lookIndex));
  return out;
}

function subjectSeen(subject: string, shown: Set<string>): boolean {
  const needle = `|${subject}|`;
  for (const fp of shown) {
    if (fp.includes(needle)) return true;
  }
  return false;
}

function pickKind(
  list: Candidate[],
  lockId: string | null | undefined,
  shown: Set<string>
): Candidate | null {
  if (lockId) {
    const locked = list.find((c) => c.id === lockId);
    if (locked) return locked;
  }
  const scored = list
    .map((c) => ({
      c,
      score:
        c.rank -
        (shown.has(c.fingerprint) ? 1000 : 0) -
        (subjectSeen(c.subject, shown) ? 25 : 0),
    }))
    .filter((x) => x.score > -400)
    .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));
  return scored[0]?.c ?? null;
}

export function pickHomeNotices(
  candidates: Candidate[],
  opts: {
    noticeLabel: string;
    shown?: Iterable<string>;
    sittingLock?: { noticeId?: string | null; gapId?: string | null };
  }
): MorningNotice[] {
  const shown = new Set(opts.shown ?? []);
  const notices = candidates.filter((c) => c.kind === "notice");
  const gaps = candidates.filter((c) => c.kind === "gap");
  const out: MorningNotice[] = [];
  const n = pickKind(notices, opts.sittingLock?.noticeId, shown);
  if (n) {
    out.push({
      id: n.id,
      fingerprint: n.fingerprint,
      label: n.label ?? opts.noticeLabel,
      text: n.text,
      kind: "notice",
      source: n.source ?? "holdings",
      ticker: n.ticker,
    });
  }
  const g = pickKind(gaps, opts.sittingLock?.gapId, shown);
  if (g) {
    out.push({
      id: g.id,
      fingerprint: g.fingerprint,
      label: g.label ?? "Also",
      text: g.text,
      kind: "gap",
      source: g.source ?? "holdings",
      ticker: g.ticker,
    });
  }
  return out;
}

/** One screen of Today, no new model call. Uses live book + cached Pulse. */
export function buildMorningRead(
  model: OverviewModel,
  visitDiff: VisitDiff | null,
  session: SessionKind = "unknown",
  extras: MorningReadExtras = {}
): MorningRead {
  const weekend = isUsWeekend();
  const when = insightWhen(session);
  const { quiet, sentence } = daySentence(model, weekend);
  const awayLines = visitDiff?.lines.slice(0, 3) ?? [];
  const sunday = isSundayTallinn() ? buildSundayRecap(model) : null;
  const afterClose = isUsAfterCashClose(session);
  const lookIndex = extras.lookIndex ?? 0;
  const noticeLabel = when === "friday" ? "Friday's close" : "Update";
  const notices = pickHomeNotices(
    liveCandidates(model, visitDiff, when, extras.notes, lookIndex),
    {
      noticeLabel,
      shown: extras.shown,
      sittingLock: extras.sittingLock,
    }
  );
  return {
    quiet: quiet && awayLines.length === 0,
    sentence,
    notices,
    awayLines,
    drivers: sunday ? [] : driversFor(model),
    afterClose: !sunday && afterClose,
    sunday,
    moveLabel: when === "friday" ? "Friday" : "Today",
  };
}

export function loadHomePulseNotes(tickers: string[]): HomePulseNote[] {
  if (typeof window === "undefined") return [];
  const conv = loadConvictionMap();
  return tickers.map((ticker) => {
    const key = ticker.toUpperCase();
    const pulse = loadPulseTickerCache(key);
    const thesis = conv[key]?.thesis?.trim() ?? "";
    return {
      ticker: key,
      thesisStatus: pulse?.check.thesisStatus ?? null,
      hasThesis: thesis.length > 0,
      moveReason: pulse?.check.moveReason ?? null,
    };
  });
}
