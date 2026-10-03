/**
 * What a company page says about its own written half: when it was
 * written, whether it still stands, and if not, what happened.
 *
 * A page that keeps its argument for weeks owes the reader that sentence.
 * Kept is only honest when it is said: the analysis on screen may be days
 * old, and a reader deciding how much weight to give it needs the date and
 * the reason it was not rewritten, or the reason it is being rewritten now.
 * Every sentence names something checkable (a date, a headline with its
 * publisher, a price, a percentage), and none tells the reader what to do.
 *
 * Pure, so the copy rules are tested without a page: no dashes as clause
 * breaks, no verdict words, no instruction.
 */
import type { BriefState } from "@/lib/company/brief-store";
import { cashtag, currency, percent } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";

export type BriefStatusCopy = {
  /** A short label for the note. */
  label: string;
  /** The sentence itself. */
  text: string;
  /** Whether the note is about something having changed. */
  changed: boolean;
};

function day(at: string | null | undefined): string | null {
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  return formatDateTime(at, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The note for a page, or null when there is nothing worth saying (a thin
 * company, which says so in its own panel, or a page with no written half
 * that is not being written either: the public page carries its own panel
 * for that case).
 */
export function briefStatusCopy(input: {
  state: BriefState;
  ticker: string;
  /** When the analysis on file was written. */
  briefAt: string | null;
  /** The listing's money, for a price in the sentence. */
  code?: string;
  /** A new one is being written right now, for this reader. */
  rewriting?: boolean;
  /** The last attempt to rewrite it failed. */
  failed?: boolean;
}): BriefStatusCopy | null {
  const { state, ticker, briefAt, code = "USD", rewriting, failed } = input;
  const tag = cashtag(ticker);
  const written = day(briefAt);
  const writtenSaid = written ? `Written ${written}` : "Written earlier";

  const after = failed
    ? " It could not be rewritten just now, so this is the version on file; the figures and the price above are current."
    : rewriting
      ? " A new version is being written now and will replace this one when it lands, usually within a minute. Everything above it is already current."
      : " It is due to be rewritten with that in it. The figures and the price above are already current.";

  if (state.kind === "missing") {
    if (!rewriting) return null;
    return {
      label: "Being written",
      text: `The written analysis of ${tag} is being written now and arrives in about a minute. The figures, the price and the fair value zones above are already current.`,
      changed: true,
    };
  }

  if (state.kind === "thin") return null;

  if (state.kind === "fresh") {
    return {
      label: "Up to date",
      text: `${writtenSaid} and still current. It is rewritten when ${tag} reports new figures, when news of results, a deal, a change at the top, a regulator or a court lands, or when the price moves a fifth, and none of that has happened since. The price and the zones above are live.`,
      changed: false,
    };
  }

  switch (state.reason) {
    case "news": {
      const h = state.headline;
      const when = day(h.publishedAt);
      return {
        label: "News since",
        text: `${writtenSaid}. Since then: "${h.title}" (${h.publisher}${when ? `, ${when}` : ""}).${after}`,
        changed: true,
      };
    }
    case "figures":
      return {
        label: "New figures",
        text: `${writtenSaid}, before ${tag}'s latest reported figures, which are the ones shown above.${after}`,
        changed: true,
      };
    case "price":
      return {
        label: "Price has moved",
        text: `${writtenSaid}, when the share price was ${currency(state.anchorPrice, 2, code)}. It has moved ${percent(Math.abs(state.moved), 0)} ${state.moved >= 0 ? "up" : "down"} since.${after}`,
        changed: true,
      };
    case "age":
      return {
        label: "Three weeks old",
        text: `${writtenSaid}, more than three weeks ago. Nothing in the figures or the news has called for a rewrite, and it is refreshed anyway after that long.${after}`,
        changed: true,
      };
  }
}
