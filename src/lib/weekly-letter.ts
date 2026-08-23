/**
 * The Sunday letter — the only scheduled email Upside Lab sends.
 *
 * It answers four questions, in this order, the way a person would write
 * them: how did your week go, what looks worth doing something about,
 * what on your watchlist got cheaper, and what's on next week's calendar.
 *
 * The suggestions are not invented here. They come from Pulse verdicts the
 * reader already saw in the app (stored per ticker in their conviction
 * notes) plus two plain arithmetic checks — a position that has grown into
 * an outsized share of the book, and a watchlist name that fell this week.
 * Margus writes the prose on top of these facts; he never sources them.
 */

import { cashtag, currency, signedCurrency, signedPercent } from "@/lib/format";
import { groupMoneyInText, previewMoneySeparators } from "@/lib/money-text";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { statusLabel } from "@/lib/thesis-pulse";
import {
  EMAIL,
  emailAccountFooter,
  emailButton,
  emailCard,
  escapeEmail,
  wrapEmailLetter,
} from "@/lib/email-letter";
import type { ConvictionEntry, ConvictionMap } from "@/lib/conviction";
import type { EarningsEvent, WeekReturn } from "@/lib/market/yahoo";
import type { Quote } from "@/lib/types";

type HoldingRow = {
  ticker: string;
  shares: number;
  buy_price: number;
};

export type WeeklyLetterInput = {
  name: string | null;
  cash: number;
  holdings: HoldingRow[];
  quotes: Record<string, Quote>;
  conviction?: ConvictionMap;
  weekReturns?: Record<string, WeekReturn>;
  earnings?: EarningsEvent[];
  /** Names the reader watches but does not own, synced from their browser. */
  watchlist?: string[];
  /** Quotes and week moves for those watched names. */
  watchQuotes?: Record<string, Quote>;
  watchWeekReturns?: Record<string, WeekReturn>;
  now?: Date;
};

export type WeeklyMover = {
  ticker: string;
  price: number;
  pct: number;
  dollar: number;
};

export type SuggestionKind = "add" | "trim" | "sell";

export type WeeklySuggestion = {
  kind: SuggestionKind;
  ticker: string;
  /** One plain sentence saying why, in words a beginner can read. */
  line: string;
  /** Where it came from, so the email can be honest about its own source. */
  source: "pulse" | "size" | "price";
  /**
   * The Pulse badge in the reader's own words — "Thesis intact",
   * "Thesis watch", "Thesis broken" — the same three phrases the app
   * shows, never the raw enum. Null when the suggestion is arithmetic.
   */
  status: string | null;
};

export type WeeklyWatchBuy = {
  ticker: string;
  price: number;
  pct: number;
  line: string;
};

export type WeeklyWeight = {
  ticker: string;
  weight: number;
};

export type WeeklyLetter = {
  dateLine: string;
  shortDate: string;
  name: string | null;
  book: number;
  cash: number;
  nameCount: number;
  weekDollar: number;
  weekPct: number | null;
  quiet: boolean;
  opening: string;
  subjectHook: string;
  movers: WeeklyMover[];
  weights: WeeklyWeight[];
  suggestions: WeeklySuggestion[];
  watchBuys: WeeklyWatchBuy[];
  weekAhead: string[];
  margus: string | null;
};

const BOOK_URL = `${EMAIL.origin}/`;

/* ---------------------------------------------------------------- money */

/*
 * Money in the letter is the same money as everywhere else in the app:
 * `format.ts` owns it, so a separator can never be right in one place and
 * missing in another. `currency` also answers a dash for a non-finite
 * number rather than rendering `$NaN` into someone's inbox.
 */
function money(n: number): string {
  return currency(n, 0);
}

function priceMoney(n: number): string {
  return currency(n, 2);
}

function signedMoney(n: number): string {
  return signedCurrency(n, 0);
}

function signedPct(pct: number): string {
  return signedPercent(pct / 100, 1);
}

/**
 * `fetchWeekReturns` reports a **fraction**: 0.3 is a 30% week. The letter
 * reads percents everywhere else -- the portfolio's own week is already
 * `(dollars / start) * 100` -- and the two were used interchangeably. So a
 * name that had run 30% printed `+0.3%` in What moved, an ordinary week
 * printed `-0.0%`, `quiet` was true unless something doubled, and a
 * watchlist name had to fall 300% to clear the -3 dip threshold. One
 * conversion, at the boundary, and every reader of `pct` agrees.
 */
function weekPctOf(wr: { pct: number } | undefined | null): number | null {
  if (!wr || !Number.isFinite(wr.pct)) return null;
  return wr.pct * 100;
}

function weightPct(weight: number): string {
  return `${(weight * 100).toFixed(0)}%`;
}

/* --------------------------------------------------------------- shapes */

function dateLine(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Tallinn",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

export function parseConviction(raw: unknown): ConvictionMap {
  if (!raw || typeof raw !== "object") return {};
  return raw as ConvictionMap;
}

/** The Pulse badge as a person reads it, never the raw enum value. */
function humanPulseStatus(raw: string | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return statusLabel(s);
}

/** The newest Pulse stamp on a ticker, if the reader ever ran one. */
function latestStamp(entry: ConvictionEntry | undefined) {
  const stamps = entry?.stamps;
  if (!Array.isArray(stamps) || stamps.length === 0) return null;
  return [...stamps].sort((a, b) =>
    String(b.at ?? "").localeCompare(String(a.at ?? ""))
  )[0];
}

type Position = {
  ticker: string;
  shares: number;
  price: number;
  value: number;
  weight: number;
  weekPct: number | null;
  weekDollar: number;
};

function positionsFor(input: WeeklyLetterInput): {
  positions: Position[];
  book: number;
  weekDollar: number;
  weekPct: number | null;
} {
  const byTicker = new Map<string, { shares: number }>();
  for (const h of input.holdings) {
    const t = h.ticker.toUpperCase();
    if (!t || !(h.shares > 0)) continue;
    const prev = byTicker.get(t);
    byTicker.set(t, { shares: (prev?.shares ?? 0) + h.shares });
  }

  const rows: Position[] = [];
  for (const [ticker, { shares }] of byTicker) {
    const q = input.quotes[ticker];
    const price = Number(q?.price ?? 0);
    if (!(price > 0)) continue;
    const value = shares * price;
    const wr = input.weekReturns?.[ticker];
    const weekPct = weekPctOf(wr);
    const weekDollar =
      wr && Number.isFinite(wr.start) && wr.start > 0
        ? shares * (wr.end - wr.start)
        : 0;
    rows.push({
      ticker,
      shares,
      price,
      value,
      weight: 0,
      weekPct,
      weekDollar,
    });
  }

  const holdingsValue = rows.reduce((s, r) => s + r.value, 0);
  const book = holdingsValue + input.cash;
  for (const r of rows) r.weight = holdingsValue > 0 ? r.value / holdingsValue : 0;

  const weekDollar = rows.reduce((s, r) => s + r.weekDollar, 0);
  const startValue = rows.reduce((s, r) => {
    const wr = input.weekReturns?.[r.ticker];
    return s + (wr && wr.start > 0 ? r.shares * wr.start : r.value);
  }, 0);
  const weekPct =
    startValue > 0 && weekDollar !== 0 ? (weekDollar / startValue) * 100 : null;

  rows.sort((a, b) => b.value - a.value);
  return { positions: rows, book, weekDollar, weekPct };
}

/* ---------------------------------------------------------- suggestions */

/** A position this big is a concentration worth naming out loud. */
const HEAVY_WEIGHT = 0.3;
/** A watchlist name has to have fallen at least this much to be worth a look. */
const WATCH_DIP_PCT = -3;

function pulseSuggestions(
  positions: Position[],
  conviction: ConvictionMap | undefined
): WeeklySuggestion[] {
  if (!conviction) return [];
  const out: WeeklySuggestion[] = [];
  for (const p of positions) {
    const entry = conviction[p.ticker];
    const stamp = latestStamp(entry);
    if (!stamp) continue;
    const action = String(stamp.action ?? "").toLowerCase();
    const status = String(stamp.thesisStatus ?? "").toLowerCase();
    const tag = cashtag(p.ticker);
    const badge = humanPulseStatus(stamp.thesisStatus);
    if (status === "broken" || action === "sell") {
      out.push({
        kind: "sell",
        ticker: p.ticker,
        source: "pulse",
        status: badge,
        line: `The last Pulse you ran on ${tag} said the reason you bought it no longer holds. Worth deciding whether you still want it.`,
      });
      continue;
    }
    if (action === "trim") {
      out.push({
        kind: "trim",
        ticker: p.ticker,
        source: "pulse",
        status: badge,
        line: `Pulse flagged ${tag} as one to take something off. It is ${weightPct(p.weight)} of what you own.`,
      });
      continue;
    }
    if (action === "add") {
      out.push({
        kind: "add",
        ticker: p.ticker,
        source: "pulse",
        status: badge,
        line: `Pulse still likes ${tag}, and it is only ${weightPct(p.weight)} of what you own.`,
      });
    }
    // A "watch" / "wait" verdict deliberately produces nothing. The letter
    // only ever suggests adding, trimming, or selling; "keep an eye on it"
    // is not an action worth an inbox.
  }
  return out;
}

function sizeSuggestions(positions: Position[]): WeeklySuggestion[] {
  return positions
    .filter((p) => p.weight >= HEAVY_WEIGHT)
    .map((p) => ({
      kind: "trim" as const,
      ticker: p.ticker,
      source: "size" as const,
      status: null,
      line: `${cashtag(p.ticker)} is now ${weightPct(p.weight)} of everything you own. One company doing that much of the work cuts both ways.`,
    }));
}

export function buildSuggestions(
  positions: Position[],
  conviction: ConvictionMap | undefined
): WeeklySuggestion[] {
  const seen = new Set<string>();
  const out: WeeklySuggestion[] = [];
  // Pulse first: it is the reader's own recorded read, so it outranks a
  // rule of thumb about position size.
  for (const s of [...pulseSuggestions(positions, conviction), ...sizeSuggestions(positions)]) {
    if (seen.has(s.ticker)) continue;
    seen.add(s.ticker);
    out.push(s);
  }
  return out.slice(0, 4);
}

export function buildWatchBuys(input: WeeklyLetterInput): WeeklyWatchBuy[] {
  const held = new Set(input.holdings.map((h) => h.ticker.toUpperCase()));
  const out: WeeklyWatchBuy[] = [];
  for (const raw of input.watchlist ?? []) {
    const ticker = raw.toUpperCase();
    if (held.has(ticker)) continue;
    const q = input.watchQuotes?.[ticker];
    const price = Number(q?.price ?? 0);
    if (!(price > 0)) continue;
    const wr = input.watchWeekReturns?.[ticker];
    const pct = weekPctOf(wr);
    if (pct == null || pct > WATCH_DIP_PCT) continue;
    out.push({
      ticker,
      price,
      pct,
      line: `${cashtag(ticker)} is ${signedPct(pct)} on the week, at ${priceMoney(price)}. You have been watching it.`,
    });
  }
  out.sort((a, b) => a.pct - b.pct);
  return out.slice(0, 3);
}

function weekAheadFor(
  earnings: EarningsEvent[],
  interesting: Set<string>
): string[] {
  return earnings
    .filter((e) => e.days >= 0 && e.days <= 8 && interesting.has(e.ticker.toUpperCase()))
    .sort((a, b) => a.days - b.days)
    .slice(0, 4)
    .map((e) => {
      const when =
        e.days === 0
          ? "today"
          : e.days === 1
            ? "tomorrow"
            : `in ${e.days} days`;
      const hedge = e.dateIsEstimate ? " (date not confirmed yet)" : "";
      return `${cashtag(e.ticker)} reports ${when}${hedge}.`;
    });
}

function openingLine(input: {
  weekDollar: number;
  weekPct: number | null;
  movers: WeeklyMover[];
  quiet: boolean;
}): string {
  if (input.quiet) return "A quiet week. Nothing much moved either way.";
  const best = input.movers.find((m) => m.pct > 0);
  const worst = [...input.movers].reverse().find((m) => m.pct < 0);
  const bits: string[] = [];
  if (best) bits.push(`${cashtag(best.ticker)} did the lifting`);
  if (worst && worst.ticker !== best?.ticker) {
    bits.push(`${cashtag(worst.ticker)} pulled the other way`);
  }
  if (bits.length === 0) return "A quiet week.";
  return `${bits.join(", and ")}.`;
}

/* ----------------------------------------------------------------- build */

export function buildWeeklyLetter(input: WeeklyLetterInput): WeeklyLetter {
  const now = input.now ?? new Date();
  const { positions, book, weekDollar, weekPct } = positionsFor(input);

  /*
   * "What moved" means what moved, in either direction. Sorting by percent
   * and taking the first five kept the five *most positive* names, so a
   * portfolio's worst week could be missing the name that caused it: a -10%
   * holding dropped off the bottom while a -1% one stayed. Pick by size of
   * move, then read them down from best to worst.
   */
  const movers: WeeklyMover[] = positions
    .filter((p) => p.weekPct != null)
    .map((p) => ({
      ticker: p.ticker,
      price: p.price,
      pct: p.weekPct as number,
      dollar: p.weekDollar,
    }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5)
    .sort((a, b) => b.pct - a.pct);

  const quiet =
    movers.every((m) => Math.abs(m.pct) < 1) && Math.abs(weekPct ?? 0) < 1;

  const earnings = input.earnings ?? [];
  const interesting = new Set<string>([
    ...positions.map((p) => p.ticker),
    ...(input.watchlist ?? []).map((t) => t.toUpperCase()),
  ]);

  return {
    dateLine: dateLine(now),
    shortDate: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Tallinn",
      day: "numeric",
      month: "short",
    }).format(now),
    name: input.name,
    book,
    cash: input.cash,
    nameCount: positions.length,
    weekDollar,
    weekPct,
    quiet,
    opening: openingLine({ weekDollar, weekPct, movers, quiet }),
    subjectHook: signedMoney(weekDollar),
    movers,
    weights: positions
      .slice(0, 5)
      .map((p) => ({ ticker: p.ticker, weight: p.weight })),
    suggestions: buildSuggestions(positions, input.conviction),
    watchBuys: buildWatchBuys(input),
    weekAhead: weekAheadFor(earnings, interesting),
    margus: null,
  };
}

export function weeklySubject(r: WeeklyLetter): string {
  return groupMoneyInText(`Your week: ${r.subjectHook}, ${r.shortDate}`);
}

export function weeklyPreview(r: WeeklyLetter): string {
  // This is the line under the subject in an inbox list, so it is the one
  // string whose separators have to survive Gmail's snippet pass.
  return previewMoneySeparators(
    `${signedMoney(r.weekDollar)} this week. ${r.opening}`
  );
}

/* ------------------------------------------------------------ plain text */

const ACTION_WORD: Record<SuggestionKind, string> = {
  add: "Worth adding to",
  trim: "Worth trimming",
  sell: "Worth a hard look",
};

/** Most consequential first, so "worth a hard look" is never buried under
 * two adds. */
const SUGGESTION_ORDER: SuggestionKind[] = ["sell", "trim", "add"];

export type WeeklySuggestionGroup = {
  kind: SuggestionKind;
  title: string;
  items: WeeklySuggestion[];
};

/**
 * One section per kind, not one card per suggestion.
 *
 * The letter drew a card for every suggestion, so a reader with two adds
 * and two trims got four cards and read the heading "Worth adding to"
 * twice, interleaved. Same suggestions, in the same order within a kind,
 * under one heading each.
 */
export function groupSuggestions(
  items: WeeklySuggestion[]
): WeeklySuggestionGroup[] {
  return SUGGESTION_ORDER.map((kind) => ({
    kind,
    title: ACTION_WORD[kind],
    items: items.filter((s) => s.kind === kind),
  })).filter((group) => group.items.length > 0);
}

export function weeklyLetterText(r: WeeklyLetter): string {
  const names = r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;
  const lines: string[] = [];
  lines.push(weeklyPreview(r), "", `Your week: ${r.dateLine}`, "");
  lines.push(
    `Your portfolio  ${money(r.book)}`,
    names,
    `This week  ${signedMoney(r.weekDollar)}${
      r.weekPct != null ? `  ${signedPct(r.weekPct)}` : ""
    }`
  );
  if (r.margus) lines.push("", r.margus);

  if (r.movers.length > 0) {
    lines.push("", "What moved");
    for (const m of r.movers) {
      lines.push(
        `  ${m.ticker}  ${priceMoney(m.price)}  ${signedPct(m.pct)}  ${signedMoney(m.dollar)}`
      );
    }
  }
  for (const group of groupSuggestions(r.suggestions)) {
    lines.push("", group.title);
    for (const s of group.items) {
      lines.push(`  ${s.line}${s.status ? ` (${s.status})` : ""}`);
    }
  }
  if (r.watchBuys.length > 0) {
    lines.push("", "On your watchlist");
    for (const w of r.watchBuys) lines.push(`  ${w.line}`);
  }
  if (r.weekAhead.length > 0) {
    lines.push("", "Next week");
    for (const w of r.weekAhead) lines.push(`  ${w}`);
  }
  lines.push("", ADVICE_DISCLAIMER_SHORT);
  lines.push("", "One email a week, on Sunday. Turn it off in Account.");
  return groupMoneyInText(lines.join("\n"));
}

/* ------------------------------------------------------------------ HTML */

/**
 * Air above and below a hairline, in every table in the letter.
 *
 * One number, because a divider with more room on one side than the other
 * is the thing you notice: the suggestion rows used to pad only the top,
 * so a line sat tight under the row above it and loose under the row
 * below. Ten is also tighter than the thirteen What moved carried, which
 * had the rows drifting apart down the page.
 */
const ROW_PAD = 10;
/** The same idea inside a card, where the type is larger. */
const CARD_ROW_PAD = 13;

function toneColor(n: number): string {
  if (n > 0) return EMAIL.gain;
  if (n < 0) return EMAIL.loss;
  return EMAIL.muted;
}

function kicker(text: string): string {
  return `<p style="margin:0;font-family:${EMAIL.sans};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL.gold}">${escapeEmail(text)}</p>`;
}

function gap(px: number): string {
  return `<div style="height:${px}px;font-size:0;line-height:0">&nbsp;</div>`;
}

/** A hairline, and whatever sits under it. */
function rule(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:34px 0 0 0">
  <tr><td style="height:1px;background:${EMAIL.line};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:24px 0 0 0">${inner}</td></tr>
</table>`;
}

/** A titled block on the black field, hairline above it. */
function block(title: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:34px 0 0 0">
  <tr><td style="height:1px;background:${EMAIL.line};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:20px 0 0 0">${kicker(title)}</td></tr>
  <tr><td style="padding:16px 0 0 0">${inner}</td></tr>
</table>`;
}

function moversTable(movers: WeeklyMover[]): string {
  const rows = movers
    .map((m, i) => {
      const c = toneColor(m.pct);
      const border =
        i === movers.length - 1 ? "none" : `1px solid ${EMAIL.line}`;
      return `<tr>
  <td style="padding:${ROW_PAD}px 12px ${ROW_PAD}px 0;border-bottom:${border};vertical-align:middle">
    <p style="margin:0;font-family:${EMAIL.sans};font-size:15px;line-height:1.25;font-weight:600;color:${EMAIL.cream}">${escapeEmail(cashtag(m.ticker))}</p>
    <p style="margin:2px 0 0 0;font-family:${EMAIL.mono};font-size:13px;line-height:1.25;color:${EMAIL.muted}">${escapeEmail(priceMoney(m.price))}</p>
  </td>
  <td style="padding:${ROW_PAD}px 0;border-bottom:${border};vertical-align:middle;text-align:right">
    <p style="margin:0;font-family:${EMAIL.mono};font-size:15px;line-height:1.25;font-weight:600;color:${c}">${escapeEmail(signedPct(m.pct))}</p>
    <p style="margin:2px 0 0 0;font-family:${EMAIL.mono};font-size:13px;line-height:1.25;color:${c}">${escapeEmail(signedMoney(m.dollar))}</p>
  </td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${rows}</table>`;
}

const SUGGESTION_TONE: Record<SuggestionKind, string> = {
  add: EMAIL.gain,
  trim: EMAIL.gold,
  sell: EMAIL.loss,
};

function suggestionGroupsHtml(groups: WeeklySuggestionGroup[]): string {
  return groups
    .map((group, gi) => {
      const tone = SUGGESTION_TONE[group.kind];
      const rows = group.items
        .map((s, i) => {
          const divider =
            i === 0 ? "" : `border-top:1px solid ${EMAIL.cardLine};`;
          // Equal air on both sides of that divider: this row's top pad and
          // the previous row's bottom pad.
          const top = i === 0 ? 12 : CARD_ROW_PAD;
          const bottom = i === group.items.length - 1 ? 0 : CARD_ROW_PAD;
          return `<tr><td style="${divider}padding:${top}px 0 ${bottom}px 0">
    <p style="margin:0;font-family:${EMAIL.sans};font-size:15px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(s.line)}</p>${
      s.status
        ? `\n    <p style="margin:7px 0 0 0;font-family:${EMAIL.sans};font-size:12px;color:${EMAIL.muted}">${escapeEmail(s.status)}</p>`
        : ""
    }
  </td></tr>`;
        })
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:${gi === 0 ? "0" : "14px"} 0 0 0;background:${EMAIL.card};border:1px solid ${EMAIL.cardLine};border-left:3px solid ${tone};border-radius:10px">
  <tr><td style="padding:16px 18px 18px 18px">
    <p style="margin:0;font-family:${EMAIL.sans};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${tone}">${escapeEmail(group.title)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${rows}</table>
  </td></tr>
</table>`;
    })
    .join("");
}

function watchList(items: WeeklyWatchBuy[]): string {
  const rows = items
    .map((w, i) => {
      const border = i === items.length - 1 ? "none" : `1px solid ${EMAIL.line}`;
      const tone = toneColor(w.pct);
      // Same two-column shape as What moved. The sentence used to carry the
      // percent and the price itself, with the percent then repeated again
      // in the right-hand column.
      return `<tr>
  <td style="padding:${ROW_PAD}px 12px ${ROW_PAD}px 0;border-bottom:${border};vertical-align:middle">
    <p style="margin:0;font-family:${EMAIL.sans};font-size:15px;line-height:1.25;font-weight:600;color:${EMAIL.cream}">${escapeEmail(cashtag(w.ticker))}</p>
    <p style="margin:2px 0 0 0;font-family:${EMAIL.sans};font-size:13px;line-height:1.25;color:${EMAIL.muted}">Cheaper than last Sunday.</p>
  </td>
  <td style="padding:${ROW_PAD}px 0;border-bottom:${border};vertical-align:middle;text-align:right;white-space:nowrap">
    <p style="margin:0;font-family:${EMAIL.mono};font-size:15px;line-height:1.25;font-weight:600;color:${tone}">${escapeEmail(signedPct(w.pct))}</p>
    <p style="margin:2px 0 0 0;font-family:${EMAIL.mono};font-size:13px;line-height:1.25;color:${EMAIL.muted}">${escapeEmail(priceMoney(w.price))}</p>
  </td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${rows}</table>`;
}

function aheadList(lines: string[]): string {
  const rows = lines
    .map(
      (line, i) => `<tr>
  <td style="padding:${i === 0 ? "0" : "12px"} 0 0 0;width:22px;vertical-align:top;font-family:${EMAIL.mono};font-size:14px;line-height:22px;color:${EMAIL.gold}">&bull;</td>
  <td style="padding:${i === 0 ? "0" : "12px"} 0 0 0;vertical-align:top;font-family:${EMAIL.sans};font-size:15px;line-height:22px;color:${EMAIL.cream}">${escapeEmail(line)}</td>
</tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${rows}</table>`;
}

function margusHtml(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p, i) =>
        `<p style="margin:${i === 0 ? "0" : "14px"} 0 0 0;font-family:${EMAIL.sans};font-size:16px;line-height:1.6;color:${EMAIL.cream}">${escapeEmail(p)}</p>`
    )
    .join("");
  return paras;
}

/** The week's figure, its percent, and what it is a percent of. */
function heroFigure(r: WeeklyLetter, names: string): string {
  const weekColor = toneColor(r.weekDollar);
  return `${kicker("Your week")}${gap(14)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td style="vertical-align:bottom">
      <p style="margin:0;font-family:${EMAIL.mono};font-size:38px;line-height:1.05;font-weight:700;letter-spacing:-0.02em;color:${weekColor}">${escapeEmail(signedMoney(r.weekDollar))}</p>
    </td>${
      r.weekPct != null
        ? `
    <td style="vertical-align:bottom;text-align:right;white-space:nowrap">
      <span style="display:inline-block;padding:5px 10px;border:1px solid ${weekColor};border-radius:999px;font-family:${EMAIL.mono};font-size:13px;font-weight:600;color:${weekColor}">${escapeEmail(signedPct(r.weekPct))}</span>
    </td>`
        : ""
    }
  </tr>
</table>
<p style="margin:16px 0 0 0;font-family:${EMAIL.sans};font-size:13px;letter-spacing:0.01em;color:${EMAIL.muted}">Your portfolio <span style="font-family:${EMAIL.mono};color:${EMAIL.cream}">${escapeEmail(money(r.book))}</span> &middot; ${escapeEmail(names)}</p>`;
}

export function weeklyLetterHtml(r: WeeklyLetter): string {
  const names = r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;

  /*
   * The figure and the two paragraphs about it are one opening, not two.
   * They used to be two cards of the same weight stacked on each other,
   * which is what made the top of the letter read as blocks rather than as
   * a letterhead: a hairline inside one card joins them the way the
   * hairlines below join the sections.
   */
  const opening = emailCard(
    `${heroFigure(r, names)}${
      r.margus
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0 0 0">
  <tr><td style="height:1px;background:${EMAIL.cardLine};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:20px 0 0 0">${margusHtml(r.margus)}</td></tr>
</table>`
        : ""
    }`
  );
  const moversBlock =
    r.movers.length > 0 ? block("What moved", moversTable(r.movers)) : "";
  const groups = groupSuggestions(r.suggestions);
  // No section kicker: "Worth a look" over cards reading "Worth trimming"
  // and "Worth a hard look" said the same word three times. Each group is
  // its own heading now.
  const suggestionBlock =
    groups.length > 0 ? rule(suggestionGroupsHtml(groups)) : "";
  const watchBlock =
    r.watchBuys.length > 0
      ? block("On your watchlist", watchList(r.watchBuys))
      : "";
  const aheadBlock =
    r.weekAhead.length > 0 ? block("Next week", aheadList(r.weekAhead)) : "";

  return wrapEmailLetter({
    title: "Your week",
    preview: weeklyPreview(r),
    dateLine: r.dateLine,
    hideOpener: true,
    // The lockup and the date share one line, with a hairline under them,
    // so the top of the letter is a masthead rather than two small things
    // floating above a large card.
    mastheadDate: true,
    body: `${gap(4)}
${opening}
${moversBlock}
${suggestionBlock}
${watchBlock}
${aheadBlock}
${emailButton(BOOK_URL, "Open your portfolio")}`,
    // The disclaimer sits in the footer rather than inside Margus's card,
    // so it is there whether or not the model wrote anything that week.
    footer: `<p style="margin:34px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">${escapeEmail(ADVICE_DISCLAIMER_SHORT)}</p>${emailAccountFooter()}`,
  });
}
