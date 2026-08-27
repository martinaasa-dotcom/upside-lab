import {
  buildBookInsights,
  concentrationDayLine,
  neighborGapsToday,
  type InsightHolding,
} from "@/lib/book-insights";
import { loadConvictionMap } from "@/lib/conviction";
import { cashtag, signedCurrency } from "@/lib/format";
import {
  insightWhen,
  isUsAfterCashClose,
  isUsWeekend,
  type SessionKind,
} from "@/lib/market-session";
import { loadPulseTickerCache } from "@/lib/thesis-pulse";
import type { OverviewModel } from "@/lib/overview";
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

export type MorningNotice = {
  id: string;
  label: string;
  text: string;
  /** notice = an observation. gap = something missing worth acting on.
   * Lets the two render as visibly different kinds of read, not just
   * different labels on the same box. */
  kind: "notice" | "gap";
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
};

export type MorningReadExtras = {
  /** Which sitting this is today. 0 is the first look. */
  lookIndex?: number;
  notes?: HomePulseNote[];
};

type Candidate = {
  id: string;
  kind: "notice" | "gap";
  rank: number;
  text: string;
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

function riseOrFell(pct: number): "rose" | "fell" {
  return pct >= 0 ? "rose" : "fell";
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

function awayCandidate(visitDiff: VisitDiff | null): Candidate | null {
  if (!visitDiff) return null;
  const tickerLine = visitDiff.lines.find((l) => l.id.startsWith("t-"));
  if (tickerLine) {
    return {
      id: `away-${tickerLine.id}`,
      kind: "notice",
      rank: 95,
      text: `While you were away, ${tickerLine.text}. That is the name that changed the most since you last looked.`,
    };
  }
  const nav = visitDiff.lines.find((l) => l.id === "nav");
  if (!nav) return null;
  return {
    id: "away-nav",
    kind: "notice",
    rank: 88,
    text: `${nav.text}. That is since you last opened this, not just today's open.`,
  };
}

function weekReversal(
  model: OverviewModel,
  when: "today" | "friday"
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
  return {
    id: `reversal-${t.ticker}`,
    kind: "notice",
    rank: 68,
    text: `${cashtag(t.ticker)} led your week, and it fell ${aboutMove(t.todayPct)} today. A strong week can still have a down day.`,
  };
}

function pulseCandidates(
  model: OverviewModel,
  notes: HomePulseNote[] | undefined,
  when: "today" | "friday"
): Candidate[] {
  if (!notes || notes.length === 0) return [];
  const tail = when === "friday" ? "on Friday" : "today";
  const equity = model.totals.equityValue;
  const byTicker = new Map(
    model.tickers.map((t) => [t.ticker.toUpperCase(), t])
  );
  const out: Candidate[] = [];
  for (const n of notes) {
    const t = byTicker.get(n.ticker.toUpperCase());
    if (!t || t.todayPct == null) continue;
    const status = String(n.thesisStatus ?? "").toLowerCase();
    const big =
      equity > 0 ? t.currentValue / equity >= 0.1 : false;
    if (status === "watch" || status === "broken") {
      if (Math.abs(t.todayPct) < 0.015 && !big) continue;
      const label = status === "broken" ? "Thesis broken" : "Thesis watch";
      out.push({
        id: `pulse-${t.ticker}`,
        kind: "notice",
        rank: 72,
        text: `${cashtag(t.ticker)} is on ${label}, and it ${riseOrFell(t.todayPct)} ${aboutMove(t.todayPct)} ${tail}.`,
      });
    }
    if (
      !n.hasThesis &&
      Math.abs(t.todayPct) >= 0.02 &&
      equity > 0 &&
      t.currentValue / equity >= 0.08
    ) {
      out.push({
        id: `thesis-${t.ticker}`,
        kind: "gap",
        rank: 62,
        text: `${cashtag(t.ticker)} ${riseOrFell(t.todayPct)} ${aboutMove(t.todayPct)} ${tail}, and there is no thesis on file for it.`,
      });
    }
  }
  return out;
}

function liveCandidates(
  model: OverviewModel,
  visitDiff: VisitDiff | null,
  when: "today" | "friday",
  notes: HomePulseNote[] | undefined
): Candidate[] {
  const holdings = holdingsFrom(model);
  const insights = buildBookInsights(holdings, when);
  const out: Candidate[] = [];

  const away = awayCandidate(visitDiff);
  if (away) out.push(away);

  if (insights.loneMove) {
    const tag = insights.loneMove.match(/\$[A-Z][A-Z0-9.]{0,11}/)?.[0] ?? "lone";
    out.push({
      id: `lone-${tag}`,
      kind: "notice",
      rank: 82,
      text: insights.loneMove,
    });
  }

  if (insights.dayMove) {
    out.push({
      id: "groups",
      kind: "notice",
      rank: 78,
      text: insights.dayMove,
    });
  } else {
    const conc = concentrationDayLine(holdings, when);
    if (conc) {
      out.push({ id: "mix-today", kind: "notice", rank: 50, text: conc });
    }
  }

  const reversal = weekReversal(model, when);
  if (reversal) out.push(reversal);

  for (const gap of neighborGapsToday(holdings, when)) {
    out.push({
      id: gap.id,
      kind: "gap",
      rank: 55,
      text: gap.text,
    });
  }

  out.push(...pulseCandidates(model, notes, when));
  return out;
}

function byRank(a: Candidate, b: Candidate): number {
  return b.rank - a.rank || a.id.localeCompare(b.id);
}

export function pickHomeNotices(
  candidates: Candidate[],
  lookIndex: number,
  noticeLabel: string
): MorningNotice[] {
  const notices = candidates.filter((c) => c.kind === "notice").sort(byRank);
  const gaps = candidates.filter((c) => c.kind === "gap").sort(byRank);
  const out: MorningNotice[] = [];
  if (notices.length > 0) {
    const n = notices[lookIndex % notices.length]!;
    out.push({
      id: n.id,
      label: noticeLabel,
      text: n.text,
      kind: "notice",
    });
  }
  if (gaps.length > 0) {
    const g = gaps[lookIndex % gaps.length]!;
    out.push({
      id: g.id,
      label: "What's missing",
      text: g.text,
      kind: "gap",
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
  const noticeLabel = when === "friday" ? "Friday's close" : "Worth noticing";
  const notices = pickHomeNotices(
    liveCandidates(model, visitDiff, when, extras.notes),
    lookIndex,
    noticeLabel
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
    };
  });
}

