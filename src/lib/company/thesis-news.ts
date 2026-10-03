/**
 * Which headlines are the kind that change an argument about a company.
 *
 * A written company page is expensive and slow: it is a model run of up to
 * a minute, and a reader who opens a company and waits twenty seconds for a
 * page whose argument has not changed since yesterday has been made to wait
 * for nothing. So a page is written once and kept, and this file is half of
 * the answer to "kept until when". The other half is in `brief-store.ts`:
 * the company reporting new figures, the price moving a fifth, and a long
 * backstop on age.
 *
 * What it looks for is an EVENT, never a reaction. Results and guidance,
 * a deal to buy or sell a business, a change at the top, a regulator or a
 * court, a drug approval, a dividend or a round of job cuts. Each of those
 * is something the case for or against a company can turn on, and each is
 * rare enough for any one company that rewriting on it costs a few runs a
 * month rather than one a day.
 *
 * What it deliberately ignores is the daily weather around a large
 * company: "shares jump", "is it too late to buy", "analyst raises price
 * target", "what to expect from earnings". Measured against the feed, a
 * name like Nvidia carries one of those most days, and treating them as
 * news would rewrite its page daily for no change in the argument. A move
 * big enough to matter on its own is caught by the price rule instead,
 * which is the better instrument for it because it is a number rather than
 * a guess about a sentence.
 *
 * It is a keyword rule and it will be wrong both ways sometimes. That is
 * bounded on both sides: a story it misses is still caught by the figures
 * rule when the company reports, by the price rule if the market cared, and
 * by the age backstop regardless; a story it wrongly counts costs one model
 * run. Neither puts a false sentence in front of a reader, because a page
 * that is kept says when it was written and the headlines since then are
 * listed under it.
 */
import type { CompanyArticle } from "@/lib/company/sources";

export type ThesisEvent =
  | "results"
  | "deal"
  | "leadership"
  | "legal"
  | "approval"
  | "money"
  | "contract";

const EVENTS: { event: ThesisEvent; re: RegExp }[] = [
  {
    event: "results",
    re: /\b(earnings|quarterly results|(first|second|third|fourth)[ -]quarter|q[1-4]\b|(full[ -]year|annual) results|guidance|reports? ([a-z-]+ ){0,3}(revenue|sales|profit|loss|results)|(quarterly|annual|record) (revenue|sales|profit|loss)|beats? (estimates|expectations|forecasts)|miss(es|ed)? (estimates|expectations|forecasts)|(raises|lifts|cuts|lowers|slashes|boosts|withdraws|suspends) (its )?(full[ -]year |annual )?(guidance|outlook|forecast)|profit warning)\b/i,
  },
  {
    event: "deal",
    re: /\b(acquir(e|es|ed|ing)|acquisition|merg(e|er|es|ed|ing)|takeover|buyout|agrees? to buy|deal to buy|to be bought|spin[ -]?off|spins off|divest(s|ed|ing|iture)?|sells? (its |a )?(unit|business|division|stake))\b/i,
  },
  {
    event: "leadership",
    re: /(\b(ceo|cfo|chief executive|chief financial officer|chair(man|woman)?|founder)\b.{0,60}\b(steps? down|stepping down|resigns?|resigned|retires?|departs?|leaves|ousted|fired|replaced|to succeed|successor)\b)|(\b(names|appoints|hires|picks) (a )?new (ceo|cfo|chief|chair))/i,
  },
  {
    event: "legal",
    re: /\b(lawsuit|sues|sued|class action|indicted|indictment|investigation|probe|subpoena|antitrust|doj|ftc|regulators?|fined|fine of|penalt(y|ies)|settles|settled|settlement|recalls?|recalled|banned|ban on|sanctions?|sanctioned|tariffs?|export (curbs|controls|ban|restrictions|rules))\b/i,
  },
  {
    event: "approval",
    re: /\b(fda|ema)\b|\b(approval|approves|approved|rejects|rejected|clinical (trial|hold)|phase (1|2|3|i|ii|iii))\b/i,
  },
  {
    event: "money",
    re: /\b(bankrupt(cy)?|chapter 11|defaults?|defaulted|restructur(e|es|ing)|layoffs?|lays? off|job cuts|cuts? (\d[\d,]*|thousands of|hundreds of) jobs|dividend (cut|suspension|increase|hike)|(cuts|suspends|raises|hikes|increases) (its |the )?dividend|buyback|share repurchase|stock split|(share|stock) (offering|sale)|dilution|delist(s|ed|ing)?|going concern|trading halt|halts trading)\b/i,
  },
  {
    event: "contract",
    re: /(\b(wins?|won|awarded|lands|landed|secures|secured)\b.{0,50}\bcontracts?\b)|\bcontract worth\b/i,
  },
];

/**
 * The shapes a story about the daily weather takes. Checked first, so a
 * preview of results ("what to expect from earnings") or an analyst moving
 * a target is not mistaken for the results or the move.
 */
const NOISE =
  /(\?\s*$)|\b(should you|is it (too late|time)|stocks? to (buy|watch|own|hold)|top \d+|\d+ (best|top|reasons)|best .{0,30}stocks?|buy (now|today|before|the dip)|price target|targets? (raised|cut|lowered|to)|upgrades?|upgraded|downgrades?|downgraded|reiterates?|initiates?|overweight|underweight|outperform|underperform|what to (expect|watch)|ahead of (its |the )?(earnings|results|report|call)|preview|could|might)\b/i;

/** The event a headline reports, or null when it reports none. */
export function thesisEventOf(title: string): ThesisEvent | null {
  const text = (title ?? "").trim();
  if (!text) return null;
  if (NOISE.test(text)) return null;
  for (const { event, re } of EVENTS) {
    if (re.test(text)) return event;
  }
  return null;
}

export type ThesisNews = CompanyArticle & { event: ThesisEvent };

/**
 * The most recent headline published after `since` that reports an event,
 * or null when there is none.
 *
 * "After" is judged on the article's own publication time against the
 * moment the page was written, which is exactly the line between a story
 * the model was handed and one it never saw. A headline whose date cannot
 * be read is not counted, since it cannot be shown to be new.
 */
export function thesisNewsSince(
  articles: readonly CompanyArticle[] | null | undefined,
  since: string | null | undefined
): ThesisNews | null {
  const from = Date.parse(since ?? "");
  if (!Number.isFinite(from) || !articles?.length) return null;
  let best: ThesisNews | null = null;
  let bestAt = -Infinity;
  for (const a of articles) {
    const at = Date.parse(a.publishedAt ?? "");
    if (!Number.isFinite(at) || at <= from) continue;
    const event = thesisEventOf(a.title);
    if (!event) continue;
    if (at > bestAt) {
      best = { ...a, event };
      bestAt = at;
    }
  }
  return best;
}
