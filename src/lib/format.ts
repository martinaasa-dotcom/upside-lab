import { coinFromSymbol } from "@/lib/coins";
import { roundMoney } from "@/lib/money";
import { normalizeYahooTicker } from "@/lib/ticker";
export { cn } from "@/lib/utils";

/**
 * What a cell says when there is no number to put in it.
 *
 * This used to be an em dash, which is the convention every annual report
 * uses for nil and is also the single loudest tell that a sentence was
 * generated rather than written. The rule in AGENTS.md is that a reader
 * never sees one, and a reader sees these: they are in the value column of
 * every table in the app.
 *
 * A bare hyphen was the obvious swap and is wrong. These sit in
 * `tabular-nums` columns beside signed percentages, where `signedPercent`
 * already renders a loss as `-2.4%`, so a lone `-` two rows down reads as a
 * negative number whose digits failed to load rather than as "we do not
 * have this". `n/a` cannot be misread as arithmetic, and it is what a
 * person would actually write.
 *
 * One constant, so it is one edit if that call ever changes.
 */
export const NO_VALUE = "n/a";

/**
 * Every formatter rejects non-finite input, not just NaN. Division by a
 * zero cost basis (a gifted share, a fully written-down position, a
 * ticker whose previous close came back as 0) yields Infinity rather than
 * NaN in JS, which Intl happily renders as "$∞" and toFixed renders as
 * "Infinity%". NO_VALUE is the honest answer in all of those cases.
 */
function isRenderable(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

export function currency(
  value: number | null | undefined,
  digits = 2,
  code: string = "USD"
): string {
  if (!isRenderable(value)) return NO_VALUE;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(roundMoney(value, digits));
}

/** `value` is a fraction (0.123 → 12.3%). Default: 1 decimal place. */
export function percent(value: number | null | undefined, digits = 1): string {
  if (!isRenderable(value)) return NO_VALUE;
  // Multiply-then-toFixed hits the 1.005 → "1.00" trap. Round the displayed
  // percent the same way money rounds, then format the already-clean number.
  return `${roundMoney(value * 100, digits).toFixed(digits)}%`;
}

/** Same as percent, with an explicit + on gains so a row of P&L lines up. */
/*
 * The sign comes off the rounded figure, never the raw one.
 *
 * Reading the sign first and rounding afterwards prints "-$0" and "-0.0%":
 * a minus in front of nothing, which is a figure this app states as fact
 * that says less than nothing. Round to the digits actually shown, then ask
 * which way it went, so anything that rounds away is simply "$0" or "0.0%".
 */
export function signedPercent(
  value: number | null | undefined,
  digits = 1
): string {
  if (!isRenderable(value)) return NO_VALUE;
  const shown = roundMoney(value * 100, digits);
  const formatted = percent(Math.abs(value), digits);
  if (shown > 0) return `+${formatted}`;
  if (shown < 0) return `-${formatted}`;
  return formatted;
}

/** Plain number. Default: 0 decimals (shares). */
export function number(value: number | null | undefined, digits = 0): string {
  if (!isRenderable(value)) return NO_VALUE;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(roundMoney(value, digits));
}

export function signedCurrency(
  value: number | null | undefined,
  digits = 2
): string {
  if (!isRenderable(value)) return NO_VALUE;
  const shown = roundMoney(value, digits);
  const formatted = currency(Math.abs(value), digits);
  if (shown > 0) return `+${formatted}`;
  if (shown < 0) return `-${formatted}`;
  return formatted;
}

/** Strip broker currency marks people type in front of a symbol. */
export function stripTickerDecor(raw: string): string {
  return raw.trim().replace(/^[€$£]+/g, "").trim();
}

/**
 * Ticker for display: NBIS -> $NBIS. Foreign listings show the Yahoo
 * exchange (VUAA.DE, LHV1T.TL, EXXT.DE), never a fake $US cashtag.
 * Leading $ / € / £ are stripped first, so €VUAA never becomes $€VUAA.
 *
 * Display only. Never use this for a value that has to round-trip as data:
 * the ticker input in HoldingModal, CSV cells, quote-provider URLs, URL
 * params, React keys, or anything looked up in the `quotes` map. Those all
 * need the stored symbol.
 */
export function cashtag(ticker: string | null | undefined): string {
  const t = stripTickerDecor(ticker ?? "").toUpperCase();
  if (!t) return NO_VALUE;
  const yahoo = normalizeYahooTicker(t) || t;
  const coin = coinFromSymbol(yahoo) ?? coinFromSymbol(t);
  if (coin) return `$${coin.short}`;
  if (/\.[A-Z]{1,3}$/.test(yahoo)) return yahoo;
  return `$${yahoo}`;
}

/**
 * Green for a gain, red for a loss, neutral grey for flat. The single
 * source of truth for how a signed number is coloured, so a P&L figure
 * looks the same wherever it appears. Four components each had their own
 * identical copy of this before.
 *
 * Only for numbers where up is good and down is bad: P&L, ROI, today's
 * move, alpha, a change versus a benchmark. Deliberately not for plain
 * magnitudes (book value, cost basis, share counts, cash), where colour
 * would imply a judgement that isn't there.
 */
export function signedTone(
  value: number | null | undefined,
  neutral = "text-foreground/80"
): string {
  if (!isRenderable(value)) return neutral;
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return neutral;
}

export type MoveTintSpan = { text: string; tone: "up" | "down" | null };

/**
 * Split prose so only a real price move is tinted. Whole words, with a
 * number or "trending". Never the letters "up" inside "group" / "update",
 * and never "add up" / "chin up" / "show up".
 */
const MOVE_TINT_RE =
  /\btrending\s+(up|down)\b|\b(up|down)(?:\s+about)?\s+[+-]?\d+(?:\.\d+)?%/gi;

export function splitMoveTint(text: string): MoveTintSpan[] {
  const out: MoveTintSpan[] = [];
  const re = new RegExp(MOVE_TINT_RE.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      out.push({ text: text.slice(last, m.index), tone: null });
    }
    const word = (m[1] ?? m[2] ?? "").toLowerCase();
    out.push({
      text: m[0],
      tone: word === "up" ? "up" : "down",
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), tone: null });
  if (out.length === 0) out.push({ text, tone: null });
  return out;
}

/**
 * "1 portfolio" / "2 portfolios". Pass an explicit plural for irregular
 * words. Counts here are small and human-scale (portfolios, holdings,
 * members), so
 * the naive s-suffix covers everything we actually label.
 */
export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

