import { humanizeMargusText, humanizeMargusTree, pulseSuggestion } from "@/lib/ai/humanize-copy";
import { coinFromSymbol, isCoinSymbol, matchCoinQuery } from "@/lib/coins";
import { NO_VALUE, cashtag } from "@/lib/format";
import { TICKER_SECTORS } from "@/lib/forecast-plan";
import type { OverviewModel, TickerScore } from "@/lib/overview";
import type { ModelRun } from "@/lib/ai/model-label";
import type { Quote } from "@/lib/types";

/** Fraction — 0.05 = 5% */
export const PULSE_DOWN_THRESHOLD = 0.05;
export const PULSE_MIN_BOOK_PCT = 0.02;
export const PULSE_DEFAULT_TOP_N = 10;
/** A Hold → other call stays pinned to the top of Pulse for this long. */
export const PULSE_HOLD_EXIT_MS = 24 * 60 * 60 * 1000;

export type PulseMoveSource = "regular" | "pre" | "post";

export type PulseCandidate = {
  ticker: string;
  shares: number;
  buyValue: number;
  currentValue: number;
  roiPct: number;
  roiDollar: number;
  todayDollar: number;
  bookPct: number;
  portfolios: string[];
  price: number;
  regularPct: number | null;
  extendedPct: number | null;
  effectivePct: number | null;
  moveLabel: string;
  moveSource: PulseMoveSource;
  /** Down ≥5% on effective move — the “should I sell?” flag */
  needsAttention: boolean;
  /** Up or down ≥5% on the effective move */
  isBigMove: boolean;
  inBook: boolean;
};

export type ThesisStatus = "intact" | "watch" | "broken";

/**
 * trim and sell look similar but mean opposite situations: trim is
 * taking a little off a winner that ran (thesis intact), sell is what
 * you do when the thesis is actually broken. Collapsing them into one
 * "reduce" action is what made a strong name and a broken one look the
 * same on screen.
 */
export type PulseAction = "add" | "hold" | "trim" | "sell" | "watch";

export type PulseHeadline = {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
};

/**
 * `situation` used to be one prose blob and is now bullets, but reports
 * cached in localStorage before that change still hold a string. Split
 * those on sentence boundaries so an old cached report still renders as a
 * list instead of crashing on .map or showing nothing.
 */
export function normalizePulseSituation(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && !!v.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export type PulseCheck = {
  ticker: string;
  /** Short bullets, not a paragraph. Reports cached before this changed
   * hold a single string; normalizePulseSituation() handles both. */
  situation: string[];
  moveReason: string;
  thesisStatus: ThesisStatus;
  earningsNote: string;
  action: PulseAction;
  /** Suggested trim size when action=trim, e.g. 15 means trim 15% of position. */
  trimPct?: number | null;
  /** Modeled add check, e.g. "A level to think about: around $X. Then another look if it drops to around $Y." Empty if trim. */
  addLevel: string;
  verdict: string;
  /**
   * Concrete, falsifiable: what would actually invalidate the reason this
   * is in the book. Status can only leave intact if today's facts match
   * this bar (watch) or have already cleared it (broken).
   */
  thesisBreak?: string;
};

export type PulseReport = {
  generatedAt: string;
  summary: string;
  checks: PulseCheck[];
  /**
   * Which model answered this run, recorded as it answered. The eye on a
   * Pulse card names it, because "a language model read your reason" is a
   * claim a reader cannot check and a model's name is one they can.
   * Absent when nothing fresh ran and every check came back from cache.
   */
  writtenBy?: ModelRun | null;
};

/** Per-ticker cache — the unit every Pulse check is retained under. */
export type PulseTickerCacheEntry = {
  check: PulseCheck;
  headlines: PulseHeadline[];
  cachedAt: string;
};

export type PulseSummaryCacheEntry = {
  summary: string;
  cachedAt: string;
};

export const PULSE_REFRESH_MS = 60 * 60 * 1000;
const PULSE_TICKER_CACHE_PREFIX = "upside-pulse-ticker-v1:";
const PULSE_SUMMARY_CACHE_KEY = "upside-pulse-summary-v1";

export function effectiveMove(quote: Quote | null | undefined): {
  pct: number | null;
  label: string;
  source: PulseMoveSource;
  extendedPct: number | null;
} {
  if (!quote) {
    return { pct: null, label: "Today", source: "regular", extendedPct: null };
  }

  const regular = quote.changePercent ?? null;
  const pre = quote.preMarketChangePercent ?? null;
  const post = quote.postMarketChangePercent ?? null;
  const state = (quote.marketState ?? "").toUpperCase();
  const extended = post ?? pre;

  if (state.includes("PRE") && !state.includes("POST") && pre != null) {
    return { pct: pre, label: "Pre-market", source: "pre", extendedPct: pre };
  }
  if (state.includes("POST") && post != null) {
    return { pct: post, label: "After-hours", source: "post", extendedPct: post };
  }

  if (extended != null && regular != null && Math.abs(extended) > Math.abs(regular)) {
    const source: PulseMoveSource = post != null ? "post" : "pre";
    return {
      pct: extended,
      label: source === "post" ? "After-hours" : "Pre-market",
      source,
      extendedPct: extended,
    };
  }

  return {
    pct: regular,
    label: "Today",
    source: "regular",
    extendedPct: extended,
  };
}

export function isBigPulseMove(pct: number | null | undefined): boolean {
  return pct != null && Number.isFinite(pct) && Math.abs(pct) >= PULSE_DOWN_THRESHOLD;
}

/**
 * True when the latest Pulse call left Hold for add / trim / sell / wait,
 * and that change is still inside the pin window.
 */
export function pulseLeftHold(
  currentAction: PulseAction | undefined,
  history: ReadonlyArray<{ action: PulseAction; at: string }>,
  now = Date.now(),
  windowMs = PULSE_HOLD_EXIT_MS
): boolean {
  if (!currentAction || currentAction === "hold") return false;
  if (history.length < 2) return false;
  for (let i = history.length - 1; i >= 1; i--) {
    if (history[i].action !== currentAction) continue;
    if (history[i - 1].action !== "hold") return false;
    const ts = new Date(history[i].at).getTime();
    return Number.isFinite(ts) && now - ts <= windowMs;
  }
  return false;
}

/** Add / trim / sell ask you to actually do something. Hold and watch don't. */
export function isActionablePulse(
  action: PulseAction | string | null | undefined
): boolean {
  return action === "add" || action === "trim" || action === "sell";
}

export function sortPulseCandidates<
  T extends {
    ticker: string;
    effectivePct: number | null;
    bookPct: number;
    currentValue?: number;
  },
>(
  candidates: readonly T[],
  opts?: {
    leftHoldTickers?: ReadonlySet<string>;
    /** Current Pulse call per ticker, when known. A name with an add/trim/
     * sell call outranks a plain hold even on a quieter day — the whole
     * point of scanning is to surface what needs a decision. */
    actionByTicker?: Readonly<Record<string, PulseAction | undefined>>;
  }
): T[] {
  const left = opts?.leftHoldTickers ?? new Set<string>();
  const actions = opts?.actionByTicker ?? {};
  return [...candidates].sort((a, b) => {
    const aLeft = left.has(a.ticker.toUpperCase());
    const bLeft = left.has(b.ticker.toUpperCase());
    if (aLeft !== bLeft) return aLeft ? -1 : 1;
    const aActionable = isActionablePulse(actions[a.ticker.toUpperCase()]);
    const bActionable = isActionablePulse(actions[b.ticker.toUpperCase()]);
    if (aActionable !== bActionable) return aActionable ? -1 : 1;
    const aBig = isBigPulseMove(a.effectivePct);
    const bBig = isBigPulseMove(b.effectivePct);
    if (aBig !== bBig) return aBig ? -1 : 1;
    if (aBig && bBig) {
      return Math.abs(b.effectivePct ?? 0) - Math.abs(a.effectivePct ?? 0);
    }
    return (
      b.bookPct - a.bookPct || (b.currentValue ?? 0) - (a.currentValue ?? 0)
    );
  });
}

function toCandidate(
  ticker: string,
  row: TickerScore | null,
  quote: Quote | null | undefined,
  equity: number
): PulseCandidate {
  const move = effectiveMove(quote);
  const effectivePct = move.pct;
  const currentValue = row?.currentValue ?? (quote?.price ?? 0);
  const bookPct = row && equity > 0 ? row.currentValue / equity : 0;

  return {
    ticker: ticker.toUpperCase(),
    shares: row?.shares ?? 0,
    buyValue: row?.buyValue ?? 0,
    currentValue,
    roiPct: row?.roiPct ?? 0,
    roiDollar: row?.roiDollar ?? 0,
    todayDollar:
      effectivePct != null && Number.isFinite(effectivePct) && effectivePct > -1
        ? currentValue - currentValue / (1 + effectivePct)
        : 0,
    bookPct,
    portfolios: row?.portfolios ?? [],
    price: quote?.price ?? row?.price ?? 0,
    regularPct: quote?.changePercent ?? row?.todayPct ?? null,
    extendedPct: move.extendedPct,
    effectivePct,
    moveLabel: move.label,
    moveSource: move.source,
    needsAttention:
      effectivePct != null && effectivePct <= -PULSE_DOWN_THRESHOLD,
    isBigMove: isBigPulseMove(effectivePct),
    inBook: Boolean(row),
  };
}

/** Default Pulse set: all big book lines + anything up or down ≥5% (incl. pre/after). */
export function buildPulseCandidates(
  overview: OverviewModel,
  quotes: Record<string, Quote>,
  opts?: { extraTickers?: string[]; topN?: number }
): PulseCandidate[] {
  const topN = opts?.topN ?? PULSE_DEFAULT_TOP_N;
  const equity = overview.totals.equityValue;
  const byTicker = new Map(overview.tickers.map((t) => [t.ticker.toUpperCase(), t]));

  const big = overview.tickers
    .filter(
      (t) =>
        equity <= 0 ||
        t.currentValue / equity >= PULSE_MIN_BOOK_PCT ||
        overview.tickers.indexOf(t) < topN
    )
    .slice(0, topN);

  const keys = new Set<string>(big.map((t) => t.ticker.toUpperCase()));

  for (const t of overview.tickers) {
    const q = quotes[t.ticker];
    const move = effectiveMove(q);
    if (isBigPulseMove(move.pct)) {
      keys.add(t.ticker.toUpperCase());
    }
  }

  for (const raw of opts?.extraTickers ?? []) {
    const key = raw.trim().toUpperCase();
    if (key) keys.add(key);
  }

  const candidates = [...keys].map((ticker) => {
    const row = byTicker.get(ticker) ?? null;
    return toCandidate(ticker, row, quotes[ticker] ?? null, equity);
  });

  return sortPulseCandidates(candidates);
}

/** Build one pulse row — for search / single-ticker check. */
export function buildPulseCandidate(
  ticker: string,
  overview: OverviewModel,
  quotes: Record<string, Quote>
): PulseCandidate {
  const key = ticker.trim().toUpperCase();
  const row =
    overview.tickers.find((t) => t.ticker.toUpperCase() === key) ?? null;
  return toCandidate(key, row, quotes[key] ?? null, overview.totals.equityValue);
}

/**
 * Per-ticker cache — deliberately NOT scoped to a calendar day. Keying by
 * day meant every result became unreachable at midnight Tallinn time, so
 * the very first Pulse view each day showed "Pulling news & checking
 * thesis…" for every single position even though nothing had actually
 * changed. Freshness is judged purely by `cachedAt` age (isPulseCacheFresh)
 * — a result is retained and shown indefinitely until a newer one replaces
 * it, whatever day that happens to be.
 */
export function pulseTickerCacheKey(ticker: string): string {
  return `${PULSE_TICKER_CACHE_PREFIX}${ticker.trim().toUpperCase()}`;
}

export function loadPulseTickerCache(
  ticker: string
): PulseTickerCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(pulseTickerCacheKey(ticker));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PulseTickerCacheEntry | null;
    if (!parsed?.check || !parsed?.cachedAt) return null;
    return {
      ...parsed,
      check: normalizePulseCheck(humanizeMargusTree(parsed.check)),
    };
  } catch {
    return null;
  }
}

export function savePulseTickerCache(
  ticker: string,
  entry: PulseTickerCacheEntry
) {
  if (typeof window === "undefined") return;
  if (isEmptyPulseCheck(entry.check)) return;
  try {
    localStorage.setItem(
      pulseTickerCacheKey(ticker),
      JSON.stringify({
        ...entry,
        check: normalizePulseCheck(humanizeMargusTree(entry.check)),
      })
    );
  } catch {
    /* ignore */
  }
}

export function loadPulseSummary(): PulseSummaryCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PULSE_SUMMARY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PulseSummaryCacheEntry | null;
    if (!parsed?.summary) return null;
    return {
      ...parsed,
      summary: humanizeMargusText(parsed.summary),
    };
  } catch {
    return null;
  }
}

export function savePulseSummary(summary: string) {
  if (typeof window === "undefined" || !summary.trim()) return;
  try {
    localStorage.setItem(
      PULSE_SUMMARY_CACHE_KEY,
      JSON.stringify({
        summary: humanizeMargusText(summary),
        cachedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* ignore */
  }
}

export function isPulseCacheFresh(
  entry: { cachedAt: string } | null,
  maxAgeMs = PULSE_REFRESH_MS
): boolean {
  if (!entry?.cachedAt) return false;
  const ts = new Date(entry.cachedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < maxAgeMs;
}

/**
 * Auto Pulse may call the model only for a name that was never checked,
 * a 5% mover whose last check is stale, or a name whose cached Why is a
 * leftover "Today move is -5.8%" restatement. Quiet names with a real
 * reason keep the last read until the person hits Check again.
 */
/** True when a cached Pulse row has no readable Margus body (bad save or
 * partial provider response). Those must not block auto-refresh or chat. */
export function isEmptyPulseCheck(check: PulseCheck | null | undefined): boolean {
  if (!check) return true;
  const situation = normalizePulseSituation(check.situation);
  const verdict = check.verdict?.trim() ?? "";
  const moveReason = check.moveReason?.trim() ?? "";
  const thesisBreak = check.thesisBreak?.trim() ?? "";
  const earningsNote = check.earningsNote?.trim() ?? "";
  return (
    situation.length === 0 &&
    !verdict &&
    !moveReason &&
    !thesisBreak &&
    !earningsNote
  );
}

/**
 * Old fallback Why: "Today move is -5.8%." Cached per ticker with no
 * expiry, so a quiet name keeps that sentence next to a live Today
 * column that has since flipped sign. A restatement of the move is not
 * a reason, and it must not block a new read.
 */
export function isMoveRestatement(text: string | null | undefined): boolean {
  const s = (text ?? "").trim();
  if (!s) return false;
  return /\b(?:today|pre(?:-market)?|post(?:-market)?|after-hours|extended)\s+move is\b/i.test(
    s
  );
}

export function shouldAutoPulseTicker(input: {
  needsAttention: boolean;
  cachedAt?: string;
  check?: PulseCheck | null;
}): boolean {
  if (isEmptyPulseCheck(input.check)) return true;
  if (
    isMoveRestatement(input.check?.moveReason) ||
    isMoveRestatement(input.check?.verdict)
  ) {
    return true;
  }
  if (!input.cachedAt) return true;
  if (!input.needsAttention) return false;
  return !isPulseCacheFresh({ cachedAt: input.cachedAt });
}

export function statusLabel(status: ThesisStatus | string): string {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "watch") return "Thesis watch";
  if (s === "broken") return "Thesis broken";
  return "Thesis intact";
}

export function actionLabel(action: PulseAction | string): string {
  const a = String(action ?? "").trim().toLowerCase();
  if (a === "add") return "Below recent range";
  if (a === "trim") return "Above recent range";
  if (a === "sell") return "Reason no longer matches";
  if (a === "watch") return "Not enough history";
  return "Inside recent range";
}

export function sectorForTicker(ticker: string): string | null {
  const key = ticker.toUpperCase();
  if (isCoinSymbol(key) || matchCoinQuery(key)) return "Coins";
  return TICKER_SECTORS[key] ?? null;
}

export function formatMovePct(pct: number | null): string {
  if (pct == null || Number.isNaN(pct)) return NO_VALUE;
  return `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
}

/** Match model output like `$AAPL` or ` aapl ` to the candidate key. */
export function pulseTickerKey(raw: string): string {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/^\$+/, "");
  const coin = coinFromSymbol(t) ?? matchCoinQuery(t);
  return coin?.symbol ?? t;
}

const THESIS_STATUSES: ThesisStatus[] = ["intact", "watch", "broken"];
const PULSE_ACTIONS: PulseAction[] = ["add", "hold", "trim", "sell", "watch"];

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return (allowed as readonly string[]).includes(key) ? (key as T) : fallback;
}

/*
  Never rendered. This is the exact line the model used to paste onto every
  card, kept verbatim so `isGenericThesisBreak` can still recognise it and
  throw it away. Rewriting it to read better stops it matching, which puts
  the generic line back on the cards. It is data, like a `plain-error` key.
*/
const GENERIC_THESIS_BREAK =
  "This breaks if the reason you own it disappears. Lost the customer, a restatement, or guidance that kills the multi-year case. A quiet day is not that.";

const GENERIC_BREAK_BITS = [
  "reason you own it disappears",
  "lost the customer",
  "quiet day is not that",
  "kills the multi-year case",
];

/** True for the old copy-paste kill switch that sat on every card. */
export function isGenericThesisBreak(text: string | undefined | null): boolean {
  const t = String(text ?? "")
    .trim()
    .replace(/^this breaks if\s+/i, "")
    .toLowerCase();
  if (!t) return true;
  const generic = GENERIC_THESIS_BREAK.replace(/^this breaks if\s+/i, "").toLowerCase();
  if (t === generic) return true;
  return GENERIC_BREAK_BITS.filter((bit) => t.includes(bit)).length >= 2;
}

export function cleanThesisBreak(text: unknown): string {
  if (typeof text !== "string") return "";
  const raw = text.trim().replace(/^this breaks if\s+/i, "");
  if (!raw || isGenericThesisBreak(raw)) return "";
  return raw;
}

/**
 * Cached Pulse rows went through a sanitizer that title-cased enums
 * (`intact` → `Intact`). Badges then missed the lowercase checks and
 * painted every intact Hold as "Thesis at risk". Lowercase on the way in.
 */
export function normalizePulseCheck(check: PulseCheck): PulseCheck {
  return {
    ...check,
    ticker: pulseTickerKey(check.ticker),
    thesisStatus: asEnum(check.thesisStatus, THESIS_STATUSES, "intact"),
    action: asEnum(check.action, PULSE_ACTIONS, "hold"),
    thesisBreak: cleanThesisBreak(check.thesisBreak),
  };
}

/**
 * Keeps thesisStatus and action honest against each other. The model
 * doesn't always respect the pairing rules, and the mismatch is what
 * makes the badges meaningless (Hold next to a red "Thesis at risk").
 *
 * - broken only survives with sell. If you'd still hold, add, or wait,
 *   the thesis isn't actually broken; soften to watch.
 * - broken + trim is a wording bug, not a take-profit. Trim means
 *   cutting a winner that ran too hot. Convert to sell.
 * - Copy that says nothing is wrong cannot wear watch/broken.
 *
 * Only ever downgrades or relabels toward the more conservative reading.
 * Never invents a new alarm that wasn't already there.
 */
export function reconcilePulseCheck(check: PulseCheck): PulseCheck {
  const n = normalizePulseCheck(check);
  const copy = [
    ...normalizePulseSituation(n.situation),
    n.verdict,
    n.moveReason,
  ]
    .join(" ")
    .toLowerCase();
  const soundsIntact =
    (/no stress signal/.test(copy) && /normal monitoring/.test(copy)) ||
    (/nothing unusual/.test(copy) && /no reason to change/.test(copy));

  let thesisStatus = n.thesisStatus;
  let action = n.action;

  if (soundsIntact) {
    thesisStatus = "intact";
    if (action === "sell") action = "hold";
  }

  if (thesisStatus === "broken" && action === "trim") {
    return { ...n, thesisStatus, action: "sell", trimPct: null };
  }
  if (thesisStatus === "broken" && action !== "sell") {
    thesisStatus = "watch";
  }
  if (thesisStatus === "intact" && action === "sell") {
    action = "hold";
  }
  // Trim is taking a little off a winner. That is the story working,
  // not a reason to put Thesis watch on a green card.
  if (action === "trim" && thesisStatus === "watch") {
    thesisStatus = "intact";
  }

  return { ...n, thesisStatus, action };
}

/** Names that moved, left Hold, or came back with a call that needs a why. */
export function pulseNeedsExplainer(input: {
  isBigMove: boolean;
  leftHold: boolean;
  check?: PulseCheck | null;
}): boolean {
  if (input.isBigMove || input.leftHold) return true;
  const check = input.check;
  if (!check) return false;
  if (check.thesisStatus === "watch" || check.thesisStatus === "broken") {
    return true;
  }
  return check.action !== "hold";
}

export type PulseScanRow = {
  ticker: string;
  line: string;
};

export type PulseScanInput = {
  ticker: string;
  isBigMove: boolean;
  leftHold: boolean;
  effectivePct: number | null;
  moveLabel: string;
  check?: PulseCheck | null;
  headline?: string | null;
  bookPct?: number | null;
  price?: number | null;
};

/**
 * Scan lines are a list, not sentences on a page. No stop at the end.
 * Keeps ? and ! and % so "Company?" and "-5.8%" stay readable.
 */
export function stripTrailingScanStop(text: string): string {
  return text.replace(/[.]+$/g, "").trimEnd();
}

/**
 * The scan line without the cashtag it opens with.
 *
 * Deliberately not a regular expression built from the ticker. A ticker is
 * stored data and reaches here from a CSV or a screenshot import, neither
 * of which checks the symbol shape, so a holding saved as "A(B" would have
 * made `new RegExp("^\\$A(B\\s+")` throw for an unterminated group. That
 * throw happens while Pulse renders, which takes the whole room down for
 * the reader and for every co-owner of the portfolio, over one bad row.
 * `startsWith` cannot be given a ticker it will not survive.
 */
export function scanLineBody(ticker: string, line: string): string {
  const tag = cashtag(ticker);
  const trimmed = line.trim();
  const opensWithTag =
    trimmed.toLowerCase().startsWith(tag.toLowerCase()) &&
    /^\s/.test(trimmed.slice(tag.length));
  const stripped = opensWithTag ? trimmed.slice(tag.length).trim() : trimmed;
  return stripTrailingScanStop(stripped || line);
}

/** Compare scan bodies so "$RDDT  Looks like a chase." matches the same line on $NBIS. */
export function scanLineFingerprint(
  line: string,
  ticker?: string
): string {
  let s = line.trim().toLowerCase();
  if (ticker) {
    const tag = cashtag(ticker).toLowerCase();
    if (s.startsWith(tag)) s = s.slice(tag.length);
  }
  s = s.replace(/\$[a-z]{1,6}\b/g, " ");
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}

const STOCK_SCAN_PHRASES = new Set([
  "looks like a chase not a new story",
  "if you still believe the story this is a dip to add not a sell",
  "a strong day not a new worry",
  "take a little off the reason you own it is the same",
  "hold come back if the story actually changes",
]);

function isStockScanPhrase(text: string, ticker?: string): boolean {
  const fp = scanLineFingerprint(text, ticker);
  return !fp || STOCK_SCAN_PHRASES.has(fp);
}

function clipScanHeadline(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const max = 72;
  if (s.length <= max) return s.replace(/[.…]+$/g, "").trim();
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[.,;:]+$/g, "").trim();
}

function taggedScanLine(ticker: string, body: string): string {
  const text = stripTrailingScanStop(body.trim());
  if (!text) return "";
  return `${cashtag(ticker)}  ${text}`;
}

function composeDistinctScanLine(row: {
  ticker: string;
  effectivePct: number | null;
  moveLabel: string;
  check?: PulseCheck | null;
  headline?: string | null;
  bookPct?: number | null;
  price?: number | null;
}): string[] {
  const ticker = row.ticker.trim().toUpperCase();
  const move = formatMovePct(row.effectivePct);
  const when = row.moveLabel.trim().toLowerCase() || "today";
  const check = row.check;
  const action = check?.action;
  const headline = clipScanHeadline(row.headline);
  const price =
    row.price != null && Number.isFinite(row.price) && row.price > 0
      ? `$${row.price.toFixed(2)}`
      : "";
  const lines: string[] = [];
  const fact = pulseSuggestion(check ?? {}).replace(/\.+$/, "");

  if (headline) {
    lines.push(taggedScanLine(ticker, `${move} ${when} after ${headline}`));
  }

  if (action === "trim" || action === "add" || action === "watch") {
    if (fact) lines.push(taggedScanLine(ticker, fact));
    lines.push(taggedScanLine(ticker, `${move} ${when}. ${fact}`));
  } else if (action === "sell") {
    const brk = check?.thesisBreak?.trim();
    if (brk) {
      lines.push(
        taggedScanLine(
          ticker,
          `${move} ${when}. ${brk.replace(/[.]+$/, "")}.`
        )
      );
    }
    if (fact) lines.push(taggedScanLine(ticker, fact));
    lines.push(taggedScanLine(ticker, `${move} ${when}. ${fact}`));
  }

  if (price) {
    lines.push(taggedScanLine(ticker, `${move} ${when} at ${price}.`));
  }
  if (row.bookPct != null && Number.isFinite(row.bookPct) && row.bookPct >= 0.02) {
    const share = Math.round(row.bookPct * 100);
    lines.push(
      taggedScanLine(
        ticker,
        `${move} ${when}. ${share}% of the portfolio.`
      )
    );
  }
  lines.push(taggedScanLine(ticker, `${move} ${when}.`));
  // Last ditch: keep the body unique even if two names printed the same %.
  // Bare symbol so the fingerprint does not strip it as a cashtag.
  lines.push(taggedScanLine(ticker, `${move} ${when} (${ticker}).`));
  return lines.filter(Boolean);
}

function pulseScanLineOptions(input: {
  ticker: string;
  check?: PulseCheck | null;
  effectivePct: number | null;
  moveLabel: string;
  headline?: string | null;
  bookPct?: number | null;
  price?: number | null;
}): string[] {
  const ticker = input.ticker.trim().toUpperCase();
  const check = input.check;
  const specific: string[] = [];
  const stock: string[] = [];
  const situation: string[] = [];

  const consider = (
    body: string | undefined,
    bucket: string[],
    trimRepeat = false
  ) => {
    const text = body?.trim();
    if (!text || trimRepeat || isMoveRestatement(text)) return;
    const line = taggedScanLine(ticker, text);
    if (isStockScanPhrase(text, ticker)) stock.push(line);
    else bucket.push(line);
  };

  consider(
    check?.verdict,
    specific,
    verdictRepeatsSuggestion(check?.verdict, check)
  );
  consider(check?.moveReason, specific);
  for (const sit of normalizePulseSituation(check?.situation)) {
    consider(sit, situation);
  }

  // Unique verdict/reason first. Then a headline-backed line, so two
  // names that both "ran hot" do not share a leftover situation bullet.
  return [
    ...specific,
    ...composeDistinctScanLine({ ...input, ticker }),
    ...situation,
    ...stock,
  ];
}

function firstUnusedScanLine(
  ticker: string,
  options: string[],
  used: Set<string>
): string {
  for (const line of options) {
    const fp = scanLineFingerprint(line, ticker);
    if (fp && !used.has(fp)) return line;
  }
  return options[0] ?? taggedScanLine(ticker, "Moved enough to check.");
}

export function pulseScanLine(input: {
  ticker: string;
  check?: PulseCheck | null;
  effectivePct: number | null;
  moveLabel: string;
  headline?: string | null;
  bookPct?: number | null;
  price?: number | null;
}): string {
  const ticker = input.ticker.trim().toUpperCase();
  return firstUnusedScanLine(ticker, pulseScanLineOptions({ ...input, ticker }), new Set());
}

export function buildPulseScan(rows: PulseScanInput[]): PulseScanRow[] {
  const out: PulseScanRow[] = [];
  const seen = new Set<string>();
  const usedBodies = new Set<string>();
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    if (!pulseNeedsExplainer(row)) continue;
    seen.add(ticker);
    const line = firstUnusedScanLine(
      ticker,
      pulseScanLineOptions({ ...row, ticker }),
      usedBodies
    );
    const fp = scanLineFingerprint(line, ticker);
    if (fp) usedBodies.add(fp);
    out.push({ ticker, line });
  }
  return out;
}

/** True when verdict just restates the suggestion already on the card. */
export function verdictRepeatsSuggestion(
  verdict: string | undefined,
  check:
    | {
        action?: string | null;
        trimPct?: number | null;
        addLevel?: string | null;
      }
    | null
    | undefined
): boolean {
  const v = (verdict ?? "").trim().toLowerCase();
  if (!v || !check) return false;
  const line = pulseSuggestion(check).toLowerCase();
  const norm = (s: string) => s.replace(/[^a-z0-9]+/g, " ").trim();
  const nv = norm(v);
  const nl = norm(line);
  if (!nv || !nl) return false;
  if (nv === nl) return true;
  if (nl.includes(nv)) return true;
  if (nv.includes(nl)) {
    const leftover = nv.replace(nl, " ").replace(/\s+/g, " ").trim();
    if (leftover.length < 12) return true;
  }
  return verdictRepeatsTrim(verdict, check.trimPct);
}

/** True when verdict just restates the trim line already on the card. */
export function verdictRepeatsTrim(
  verdict: string | undefined,
  trimPct: number | null | undefined
): boolean {
  const v = (verdict ?? "").trim().toLowerCase();
  if (!v || trimPct == null || !Number.isFinite(trimPct)) return false;
  if (!new RegExp(`\\b${trimPct}\\s*%`).test(v)) return false;
  const isTakeOffTalk =
    /\btrim\b/.test(v) ||
    /\btrimming\b/.test(v) ||
    /\bselling about\b/.test(v) ||
    /\bwouldn't be a bad idea\b/.test(v) ||
    /\bpeople sometimes sell\b/.test(v) ||
    /\bone check\b/.test(v);
  if (!isTakeOffTalk) return false;
  const leftover = v
    .replace(/\btrimming\b/g, " ")
    .replace(/\btrim\b/g, " ")
    .replace(/\bone check\b/g, " ")
    .replace(/\bselling (about|a little)\b/g, " ")
    .replace(/\babout\b/g, " ")
    .replace(new RegExp(`\\b${trimPct}\\s*%`, "g"), " ")
    .replace(/\binto (this|the) (strength|run)\b/g, " ")
    .replace(/\bafter a jump like this\b/g, " ")
    .replace(/\bwouldn'?t be a bad idea\b/g, " ")
    .replace(/\bkeep the rest\b/g, " ")
    .replace(/\bthe price ran\b/g, " ")
    .replace(/\bthe reason you own it didn'?t(?: change)?\b/g, " ")
    .replace(/\bpeople sometimes sell\b/g, " ")
    .replace(/\bafter a run\b/g, " ")
    .replace(/\bof this holding is a size\b/g, " ")
    .replace(/\bso (?:a winner|it) doesn'?t crowd the rest\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return leftover.length < 12;
}

/**
 * Deterministic fallback so every visible card gets a colored action/status
 * even if the model misses a ticker in its response.
 *
 * **No percentage belongs in a `moveReason` written here.** Two reasons,
 * and they compound:
 *
 * 1. It is not a reason. `moveReason` answers "why did this move", and it
 *    is what the "Recent range" table prints in its *Why* column --
 *    right beside a *Today* column already showing that same number. Two of
 *    these three branches used to return `${moveLabel} move is ${movePct}.`,
 *    so a reader asking why $AVGO was flagged got "Today move is -5.8%"
 *    next to a cell reading -5.8%: the question restated, not answered.
 * 2. It goes stale and then contradicts the column. A check is cached per
 *    ticker for `PULSE_REFRESH_MS` (an hour), while the table's percentage
 *    is recomputed live from the quote. Bake a number into the cached
 *    sentence and the two disagree within the hour -- the case that
 *    surfaced this read "Today move is -5.8%" beside a live +0.4%.
 *
 * Prose with no figure in it cannot go stale and cannot contradict the
 * number next to it, so these say the plain-language *why* instead and
 * leave the arithmetic to the column that owns it.
 *
 * No cashtag either, though the euphoric branch used to open with one.
 * `scanLineFingerprint` strips every `$XXXX` before comparing, so a ticker
 * name buys no uniqueness here -- it only doubled the tag, since
 * `taggedScanLine` prepends one of its own. Two names falling back to the
 * same branch now collide on purpose: the first prints this sentence and
 * the second drops through to `composeDistinctScanLine`, which builds a
 * distinct line from the live percentage. Which is the right outcome --
 * the ticker is already its own column in the table and its own heading on
 * the card.
 */
export function buildFallbackPulseCheck(candidate: PulseCandidate): PulseCheck {
  const move = candidate.effectivePct ?? 0;
  const euphoric =
    move >= 0.12 || (move >= 0.08 && candidate.roiPct >= 0.5);
  if (euphoric) {
    const trimPct = candidate.bookPct >= 0.08 ? 20 : 10;
    return {
      ticker: candidate.ticker,
      situation: [
        "The price is up more than it usually moves in a day.",
        "Nothing has changed in the reason you own it.",
      ],
      moveReason:
        "The price rose more than it usually does in a day, and the reason you own it has not changed.",
      thesisStatus: "intact",
      earningsNote: "",
      action: "trim",
      trimPct,
      addLevel: "",
      verdict: pulseSuggestion({ action: "trim", trimPct, ticker: candidate.ticker }),
      thesisBreak: "",
    };
  }

  if (candidate.needsAttention) {
    const price = candidate.price > 0 ? candidate.price.toFixed(2) : "spot";
    return {
      ticker: candidate.ticker,
      situation: [
        "The price is down more than it usually moves in a day.",
        "A fall in the price on its own does not mean the reason you own it has changed.",
      ],
      moveReason:
        "The price fell more than it usually does in a day, which on its own says nothing about the company.",
      thesisStatus: "intact",
      earningsNote: "",
      action: "add",
      trimPct: null,
      addLevel: `around $${price}`,
      verdict: pulseSuggestion({
        action: "add",
        addLevel: `around $${price}`,
        ticker: candidate.ticker,
      }),
      thesisBreak: "",
    };
  }

  return {
    ticker: candidate.ticker,
    situation: [
      "Nothing unusual happened today.",
      "The price stayed inside its normal daily range.",
    ],
    moveReason:
      "The price stayed inside the range it normally moves in on a day.",
    thesisStatus: "intact",
    earningsNote: "",
    action: "hold",
    trimPct: null,
    addLevel: "",
    verdict: pulseSuggestion({ action: "hold", ticker: candidate.ticker }),
    thesisBreak: "",
  };
}
