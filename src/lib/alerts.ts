import { cashtag, currency, percent } from "@/lib/format";
import {
  marginCopy,
  marginHealth,
  marginTone,
  type MarginToneName,
} from "@/lib/margin-health";
import type { GlossaryExample } from "@/lib/glossary";
import {
  isActionableBand,
  ladderMomentDetail,
  ladderMomentTitle,
} from "@/lib/company/plan-ladder";
import { safeDiv } from "@/lib/money";
import { dayText, deltaText, rollSaid, type CallView } from "@/lib/options/tracked-calls";
import { formatDateTime } from "@/lib/timezone";

/**
 * The four things this app watches for you, and the arithmetic under each.
 *
 * Every card here states a fact about money that is already yours, so the
 * fact is never the whole card: a beginner told "$BTC is 37% of your
 * stocks" has learned a number and nothing else. Each kind carries a
 * `learn` line that says the same fact again as what it does to their own
 * money, worked out from figures they can find on another screen. None of
 * them is a forecast and none of them is an instruction.
 */

/**
 * Which of the four this is, and the only thing a surface may branch on.
 *
 * The Cash card used to decide whether a tap opened the cash editor by
 * running `/cash|margin|borrow/i` over the card's own title and detail, so
 * rewording a sentence changed where a tap went, and a results-day card
 * that happened to mention borrowed money would have opened the editor.
 */
export type AlertKind =
  | "results"
  | "strike"
  | "margin"
  | "concentration"
  | "ladder"
  | "call";

export type UpsideAlert = {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  /**
   * The reader's own arithmetic: the same fact said again as what it does
   * to their money. Null only where there is nothing honest to work out.
   */
  learn?: string | null;
  ticker?: string;
  /**
   * How loud the surface showing this should be. Most things worth saying
   * are not emergencies, and a card that is red whatever the number says
   * teaches the reader to stop reading it. Defaults to neutral; only the
   * borrowed-money alert raises it, and only on its own arithmetic.
   */
  tone?: MarginToneName;
  /** One short line a card can show under the title without the full detail. */
  cushion?: string | null;
  /**
   * A glossary id the card hangs its explanation on, so the word a card
   * prints is the word the reader can look up. See `glossary.ts`.
   */
  term?: string;
  /**
   * The reader's own figures for that explanation, so the definition ends
   * on "You have borrowed $9,000" rather than on a dictionary sentence.
   */
  explain?: GlossaryExample;
  /** A tracked covered call's portfolio, so its card opens that panel. */
  portfolioId?: string;
  /**
   * The alert said as one row of a list rather than as a card.
   *
   * Home used to draw three alerts as three equal cards, each a title and
   * a paragraph, and they read as one grey wall: a results date, a price
   * plan and a large holding looked identical, and a reader had to read
   * every sentence to learn which was which. A row answers the three
   * questions in the order a glance asks them: what kind of thing this is
   * (`tag`), the one figure that matters (`figure`, with `note` naming
   * what it is measured against), and a short phrase (`what`). The full
   * sentences stay on the alert and in the "Worth a look" room.
   */
  digest?: AlertDigest;
};

export type AlertDigest = {
  /** Two words naming the kind of thing, printed as a label. */
  tag: string;
  /** A short phrase, no full stop. */
  what: string;
  /** The one figure, already formatted, or null where there is none. */
  figure?: string | null;
  /** What the figure is set against, short enough for one small line. */
  note?: string | null;
};

/**
 * "Since Tuesday", for a condition that has been true for a while.
 *
 * Nothing on the same calendar day gets a line: a card that appeared this
 * morning saying "since today" is noise. Inside a week the weekday is the
 * clearest thing a person can hold, and past that it takes the date.
 */
export function alertSinceLine(
  firstSeen: number | null | undefined,
  now: number = Date.now()
): string | null {
  if (firstSeen == null || !Number.isFinite(firstSeen)) return null;
  const then = new Date(firstSeen);
  const today = new Date(now);
  if (then.toDateString() === today.toDateString()) return null;
  const days = Math.floor((now - firstSeen) / 86_400_000);
  if (days < 0) return null;
  if (days < 6) {
    return `Since ${formatDateTime(then, { weekday: "long" })}`;
  }
  return `Since ${formatDateTime(then, { day: "numeric", month: "long" })}`;
}

/*
  A results date arrives as YYYY-MM-DD. `new Date("2026-09-04")` is midnight
  UTC, which formats as the 3rd for any reader west of Greenwich, so the
  parts are read out into a local date instead. A day printed one day early
  is worse than no day at all.
*/
function readDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thursday 4 September", or the raw key when it is not a date at all. */
/** "Wed 30 Sep", for a row with no room for the whole weekday. */
export function shortDate(key: string): string {
  const d = readDateKey(key);
  if (!d) return key;
  return formatDateTime(d, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function spokenDate(key: string): string {
  const d = readDateKey(key);
  if (!d) return key;
  return formatDateTime(d, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * A holding whose price has reached one of the levels that reader wrote
 * down for it.
 *
 * The whole value of a price ladder is that the level was chosen on a
 * quiet afternoon and the alert arrives on a loud one, so this says which
 * level was reached and what the reader's own ladder calls that band, and
 * stops there. It never adds an instruction of its own: the ladder is the
 * instruction, and it is the reader's. The wording itself is built per
 * band and per holding by `ladderMomentTitle`/`ladderMomentDetail`
 * (`plan-ladder.ts`) rather than one sentence every ticker is poured
 * through, so two names reaching the same band read as two different
 * situations, not the same card with the numbers swapped.
 *
 * "Close to fair value" is the one band that never wakes anybody. That
 * used to mean the three extreme bands alone, because a mild band fired
 * on an ordinary week for a volatile name, and an alert that fires while
 * nothing has happened is one a reader learns to swipe past, which is
 * the lesson the borrowed-money card already records. `holdHalf`
 * (`plan-ladder.ts`) is what let the milder bands join `ACTIONABLE_BANDS`
 * on 2026-09-15: the fair-value zone now widens for a name that swings
 * hard and narrows for one that barely moves, so landing outside it,
 * even a little, is a genuinely unusual price for that company rather
 * than a distance every company shares. The id carries the band for the
 * same reason the margin alert's carries its tier: a dismissal is
 * stored per id, and one id for every level would silence the floor
 * because somebody waved off a trim in March.
 */
export function buildLadderAlerts(
  rows: Array<{
    ticker: string;
    spot: number;
    /** The band today's price falls in, from the reader's own ladder. */
    bandId: string;
    /** That band's own words, as the ladder has them. */
    bandLabel: string;
    /** The edge the price crossed to get here, when the band has one. */
    edge: number | null;
    /** True where the reader typed at least one edge of this ladder. */
    edited: boolean;
    /** Share of the portfolio, when it is worth saying. */
    share?: number | null;
    /** Up or down against what was paid, as a fraction. */
    roiPct?: number | null;
  }>
): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  for (const r of rows) {
    // One definition of which bands are worth raising a voice about, in
    // `plan-ladder.ts`, so a name called out on the holdings map cannot
    // be quiet here.
    if (!isActionableBand(r.bandId)) continue;
    if (!(r.spot > 0)) continue;
    const moment = {
      ticker: r.ticker,
      spot: r.spot,
      bandId: r.bandId as Parameters<typeof ladderMomentTitle>[0]["bandId"],
      bandLabel: r.bandLabel,
      edge: r.edge,
      edited: r.edited,
      share: r.share,
      roiPct: r.roiPct,
    };
    out.push({
      id: `ladder-${r.bandId}-${cashtag(r.ticker)}`,
      kind: "ladder",
      title: ladderMomentTitle(moment),
      detail: ladderMomentDetail(moment),
      learn:
        "Nothing has been bought or sold, and this app is not telling you to do either. It is repeating a level you can read and change on the company's own Research page.",
      ticker: r.ticker,
      tone: r.bandId === "exit" ? "warning" : "neutral",
      digest: {
        tag: "Fair value zones",
        what:
          r.bandId === "exit"
            ? "Under its lowest fair value zone"
            : `${r.bandLabel} fair value`,
        figure: currency(r.spot, 2),
        note: ladderDigestNote(r.spot, r.edge),
      },
    });
  }
  return out;
}

/**
 * "0.4% under $237.99", the row's small line under the price. Kept to
 * one line on a phone, so it names the level and not whose it is: the
 * alert's own sentence, one press away, says whether the reader set it.
 */
function ladderDigestNote(spot: number, edge: number | null): string | null {
  if (edge == null || !(edge > 0)) return null;
  const gap = Math.abs(spot - edge) / edge;
  return `${percent(gap, 1)} ${spot >= edge ? "over" : "under"} ${currency(edge, 2)}`;
}

export function buildStrikeAlerts(
  rows: Array<{
    ticker: string;
    spot: number;
    stockTarget: number | null;
    nextStrike: number | null;
    /**
     * Whether the reader typed that target themselves.
     *
     * A stock target is `stock_target_override ?? resolveStockTarget(...)`,
     * and the second half of that is a local high off a short price
     * history. Every seeded holding has a null override, so telling a
     * beginner they had "passed the price you were aiming for" told them
     * they had set a number they have never seen. Two sentences, and the
     * app only calls a number the reader's when the reader typed it.
     */
    targetIsHandSet?: boolean;
  }>
): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  for (const r of rows) {
    if (r.stockTarget != null && r.spot > 0 && r.spot >= r.stockTarget) {
      const over = safeDiv(r.spot - r.stockTarget, r.stockTarget);
      const learn =
        over > 0
          ? `Every share is ${currency(r.spot - r.stockTarget, 2)} above that level, which is ${percent(over, 1)} past it.`
          : "The price has only just reached that level.";
      out.push(
        r.targetIsHandSet
          ? {
              id: `strike-target-${cashtag(r.ticker)}`,
              kind: "strike",
              title: `${cashtag(r.ticker)} passed the price you were aiming for`,
              detail: `The price is now ${currency(r.spot, 2)}, above the ${currency(r.stockTarget, 2)} you wrote down for it.`,
              learn,
              ticker: r.ticker,
              digest: {
                tag: "Target",
                what: "Passed the price you were aiming for",
                figure: currency(r.spot, 2),
                note: `Your target, ${currency(r.stockTarget, 2)}`,
              },
            }
          : {
              id: `strike-target-${cashtag(r.ticker)}`,
              kind: "strike",
              title: `${cashtag(r.ticker)} reached the level the app had pencilled in`,
              detail: `The price is now ${currency(r.spot, 2)}, above ${currency(r.stockTarget, 2)}. Nobody set that number: the app works it out from how high this share has been lately.`,
              learn,
              ticker: r.ticker,
              digest: {
                tag: "Target",
                what: "Passed the level the app pencilled in",
                figure: currency(r.spot, 2),
                note: `The app's level, ${currency(r.stockTarget, 2)}`,
              },
            }
      );
    }
    /*
      Closing in means approaching, and the gate used to be one-sided.

      `r.spot >= r.nextStrike * 0.98` is true two per cent below the level
      and equally true eighty per cent above it, so a reader whose hand-set
      stock target the price has long since run past was told every day that
      the price was "within about 2%" of a level it was nowhere near. A
      figure this app states as fact is never rounded up into existence, and
      this one was not even rounded: it was simply wrong, in a sentence with
      a number in it.

      Past the level is a different thing and deserves its own words, with
      the real distance in them.
    */
    if (r.nextStrike != null && r.spot > 0 && r.spot >= r.nextStrike) {
      const over = safeDiv(r.spot - r.nextStrike, r.nextStrike);
      out.push({
        id: `strike-past-${cashtag(r.ticker)}`,
        kind: "strike",
        title: `${cashtag(r.ticker)} is past the level you planned`,
        detail: `The price is ${currency(r.spot, 2)}, ${percent(over, 1)} above ${currency(r.nextStrike, 2)}. That is the level you planned, not a call you have already sold.`,
        learn: `If you had sold that agreement, your shares could be bought from you at ${currency(r.nextStrike, 2)} each, which is below what they are worth now.`,
        ticker: r.ticker,
        digest: {
          tag: "Strike",
          what: "Past the level you planned",
          figure: currency(r.spot, 2),
          note: `${percent(over, 1)} over ${currency(r.nextStrike, 2)}`,
        },
        term: "strike",
        explain: {
          ticker: cashtag(r.ticker),
          amount: currency(r.nextStrike, 2),
        },
      });
    } else if (
      r.nextStrike != null &&
      r.spot > 0 &&
      r.spot >= r.nextStrike * 0.98
    ) {
      out.push({
        id: `strike-near-${cashtag(r.ticker)}`,
        kind: "strike",
        title: `${cashtag(r.ticker)} is closing in on your strike`,
        detail: `The price is within about 2% of ${currency(r.nextStrike, 2)}. That is the level you planned, not a call you have already sold.`,
        learn: `If you had sold that agreement and the price stays above ${currency(r.nextStrike, 2)}, your shares could be bought from you at ${currency(r.nextStrike, 2)} each.`,
        ticker: r.ticker,
        digest: {
          tag: "Strike",
          what: "Closing in on the level you planned",
          figure: currency(r.spot, 2),
          note: `About 2% from ${currency(r.nextStrike, 2)}`,
        },
        term: "strike",
        explain: {
          ticker: cashtag(r.ticker),
          amount: currency(r.nextStrike, 2),
        },
      });
    }
  }
  return out;
}

/**
 * A covered call the reader has sold, when it meets one of their own rules.
 *
 * Three moments and no others, because these are the ones that cost money
 * to miss: delta at or past the level the reader rolls at, the share above
 * the strike in the last few days before expiry, and enough of the premium
 * kept that the reader's rule says buy it back. A call on track, a planned
 * one, and a near-worthless one in its last day or two stay on the panel,
 * since a card for something with nothing to decide is a card a reader
 * learns to swipe past.
 *
 * The id carries the kind of moment, for the reason the borrowed-money
 * alert's carries its tier: dismissals are per id, and waving off a "close"
 * card a fortnight ago must not silence the same call reaching its roll
 * level today.
 */
export function buildCallAlerts(views: readonly CallView[]): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  for (const { call, reading, health } of views) {
    if (call.status !== "sold" || !health.urgent) continue;
    if (health.kind !== "roll" && health.kind !== "assignment" && health.kind !== "close") {
      continue;
    }
    const name = `${cashtag(call.ticker)} ${currency(call.strike, 2)} call`;
    const delta = reading?.delta ?? null;
    const detail = [health.read, health.move].filter(Boolean).join(" ");
    const base = {
      id: `call-${health.kind}-${call.id}`,
      kind: "call" as const,
      detail,
      ticker: call.ticker,
      portfolioId: call.portfolio_id,
    };
    if (health.kind === "roll" || health.kind === "assignment") {
      out.push({
        ...base,
        title:
          health.kind === "roll"
            ? `${name} is past your roll level`
            : `${name} could take your shares this week`,
        tone: health.kind === "roll" ? "loss" : "warning",
        cushion:
          delta != null
            ? `Delta ${deltaText(delta)}, expires ${dayText(call.expiry)}.`
            : null,
        learn: reading?.roll
          ? rollSaid(reading.roll, call.contracts)
          : health.closeCost != null
            ? `Buying it back today costs ${currency(health.closeCost)}.`
            : null,
        term: "roll",
      });
    } else {
      out.push({
        ...base,
        title: `${name} is past your buy-back level`,
        tone: "neutral",
        cushion:
          health.kept != null
            ? `${percent(health.kept, 0)} of the premium kept.`
            : null,
        learn:
          health.closeCost != null && health.gainTotal != null
            ? `Buying it back today costs ${currency(health.closeCost)} and locks in ${currency(health.gainTotal)}.`
            : null,
        term: "buy-to-close",
      });
    }
  }
  return out;
}

/**
 * The options half of this used to be unconditional, so somebody who told
 * onboarding they've never traded an option still got told about writing
 * calls into a print. `hideOptions` is the same flag that strips the CC
 * panel and Margus's options tools.
 */
export function buildEarningsAlerts(
  events: Array<{ ticker: string; date: string; days: number }>,
  hideOptions = true
): UpsideAlert[] {
  return events
    .filter((e) => e.days >= 0 && e.days <= 7)
    .map((e) => {
      const when =
        e.days === 0
          ? "today"
          : e.days === 1
            ? "tomorrow"
            : `in ${e.days} days`;
      return {
        id: `earn-${cashtag(e.ticker)}-${e.date}`,
        kind: "results" as const,
        // "Reports" is what a trading desk says. What actually happens is
        // that the company tells everybody how much it sold and earned in
        // the last three months, so that is what the card says.
        title: `${cashtag(e.ticker)} shares its quarterly results ${when}`,
        detail: hideOptions
          ? `That is ${spokenDate(e.date)}. Prices often move more than usual on a results day, in either direction.`
          : `That is ${spokenDate(e.date)}. Prices often move more than usual on a results day, in either direction, which makes options dearer and widens the range compared with an ordinary day.`,
        learn:
          "Nothing you own changes on the day. What changes is how much other people are willing to pay for it.",
        ticker: e.ticker,
        term: "results-day",
        // Deliberately no `second`: the glossary's worked example for this
        // word is "$AAPL reports ...", and "reports" is the trade shorthand
        // this card exists to stop saying. The definition stands on its own.
        explain: { ticker: cashtag(e.ticker) },
        digest: {
          tag: "Results",
          what: "Shares its quarterly results",
          figure: when.charAt(0).toUpperCase() + when.slice(1),
          note: shortDate(e.date),
        },
      };
    });
}

/**
 * How much of everything a reader owns sits in one company.
 *
 * Two shares, worked out once, in one place. The alert used to divide by
 * the stocks alone while Home's morning notice divided by something else,
 * so one fact reached the reader twice with two different percentages
 * beside it. The share of the stocks decides whether this is worth saying
 * at all; the share of the whole portfolio decides what a day in that one
 * company does to the reader's money, because cash does not move.
 */
export const CONCENTRATION_SHARE = 0.35;

export type Concentration = {
  ticker: string;
  value: number;
  /** Of the money that is in companies. */
  shareOfStocks: number;
  /** Of everything, cash counted. Null when the portfolio is worth nothing. */
  shareOfPortfolio: number | null;
  /** Stocks plus cash, so a loan is already taken off. Can go to nothing. */
  portfolioValue: number;
  /**
   * Whether some of what is held was borrowed, which changes the sentence
   * rather than the arithmetic.
   *
   * With cash above zero the second share is smaller than the first and
   * "that is 30% of everything you own once cash is counted" reads
   * plainly. With cash below zero it is *larger*, because the reader's own
   * money is less than the stocks are worth, and the same sentence then
   * reads as a contradiction: 52% of your stocks and 68% of everything you
   * own. The number is right and the words are wrong, so the words change.
   */
  borrowed: boolean;
  /** Whether it is large enough to be worth a card. */
  large: boolean;
};

export function concentration(input: {
  topTicker?: { ticker: string; value: number } | null;
  equityValue: number;
  cash: number;
}): Concentration | null {
  const top = input.topTicker;
  if (!top || !(input.equityValue > 0) || !(top.value > 0)) return null;
  const shareOfStocks = safeDiv(top.value, input.equityValue);
  const portfolioValue = input.equityValue + input.cash;
  return {
    ticker: top.ticker,
    value: top.value,
    shareOfStocks,
    shareOfPortfolio:
      portfolioValue > 0 ? safeDiv(top.value, portfolioValue) : null,
    portfolioValue,
    borrowed: input.cash < 0,
    large: shareOfStocks >= CONCENTRATION_SHARE,
  };
}

/** "everything you own", or the reader's own money when some is borrowed. */
function concentrationSubject(c: Concentration): string {
  return c.borrowed ? "your own money" : "everything you own";
}

/**
 * "If $BTC moved 10% in a day, that alone would move everything you own by
 * about 4%."
 *
 * A tenth is the unit because it is a round number a person can hold in
 * their head. The arithmetic is exact for that one holding: nothing here
 * guesses what the rest of the portfolio does on the same day, and the
 * sentence says "on its own" rather than pretending it knows.
 */
export function concentrationCostLine(c: Concentration): string | null {
  if (c.shareOfPortfolio == null) return null;
  return `If ${cashtag(c.ticker)} moved 10% in a day, that on its own would move ${concentrationSubject(c)} by about ${percent(c.shareOfPortfolio * 0.1, 1)}.`;
}

/** Borrowed money, and one holding growing into most of the portfolio. */
export function buildDecisionAlerts(input: {
  cash: number;
  equityValue: number;
  topTicker?: { ticker: string; value: number } | null;
}): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  // Borrowed money is a size question, not a yes/no one. See
  // `margin-health.ts`: the tone and every number in the sentence come
  // from the loan measured against what the portfolio is actually worth,
  // and from how far the stocks can fall before a broker sells them.
  const margin = marginHealth({
    cash: input.cash,
    equityValue: input.equityValue,
  });
  const copy = marginCopy(margin);
  if (copy) {
    out.push({
      id: `decision-margin-${margin.tier}`,
      kind: "margin",
      title: copy.title,
      detail: copy.detail,
      learn:
        margin.portfolioValue > 0
          ? `Gains and losses land on all ${currency(margin.stocksValue, 0)} of stock you are holding, not on the ${currency(margin.portfolioValue, 0)} that is your own money.`
          : `Gains and losses land on all ${currency(margin.stocksValue, 0)} of stock you are holding, and none of that is your own money any more.`,
      tone: marginTone(margin.tier),
      cushion: copy.cushion,
      term: "borrowed",
      explain: { amount: currency(margin.borrowed, 0) },
      digest: {
        tag: "Borrowed",
        what: copy.title,
        figure: currency(margin.borrowed, 0),
        note: null,
      },
    });
  }
  const conc = concentration(input);
  if (conc?.large) {
    out.push({
      id: `decision-conc-${cashtag(conc.ticker)}`,
      kind: "concentration",
      title: `${cashtag(conc.ticker)} is ${percent(conc.shareOfStocks, 0)} of your stocks`,
      detail:
        conc.shareOfPortfolio == null
          ? "When one holding is this large, most of how your year goes depends on this one company."
          : conc.borrowed
            ? /*
                Dollars rather than a share, because with borrowed money the
                share of the reader's own money can reach and pass 100%, and
                "that one company is 100% of your own money" reads as a
                broken number even when it is exactly right. Two amounts
                side by side say the same thing and cannot look wrong.
              */
              `Part of what you hold was borrowed, so ${cashtag(conc.ticker)} on its own is worth ${currency(conc.value, 0)} against the ${currency(conc.portfolioValue, 0)} in the account that is actually yours. When one holding is this large, most of how your year goes depends on this one company.`
            : `That is ${percent(conc.shareOfPortfolio, 0)} of everything you own once cash is counted. When one holding is this large, most of how your year goes depends on this one company.`,
      learn: concentrationCostLine(conc),
      ticker: conc.ticker,
      term: "share-of-portfolio",
      explain: {
        ticker: cashtag(conc.ticker),
        second:
          conc.shareOfPortfolio != null
            ? percent(conc.shareOfPortfolio, 0)
            : undefined,
      },
      digest: {
        tag: "Size",
        what: "Of your stocks, in one company",
        figure: percent(conc.shareOfStocks, 0),
        note:
          conc.shareOfPortfolio != null && !conc.borrowed
            ? `${percent(conc.shareOfPortfolio, 0)} of everything, cash counted`
            : null,
      },
    });
  }
  return out;
}

/**
 * Where a card's one button goes, decided once for every surface.
 *
 * Home and the alerts room each draw their own button, and both used to
 * send anything naming a company to Pulse. That is right for a card about
 * a move or a results date, and wrong for the price ladder: a ladder alert
 * repeats a level the reader can only read, argue with or change on the
 * company's own Research page, which is what its own learn line already
 * tells them. Sending them to Pulse instead offered an explanation of a
 * move nothing on the card had claimed.
 */
export type AlertDestination = "research" | "pulse" | "cash" | "calls" | "overview";

export function alertDestination(
  alert: Pick<UpsideAlert, "kind" | "ticker">
): AlertDestination {
  // A tracked call is read and changed on the covered-call panel of the
  // portfolio it was sold in, not on the company's page.
  if (alert.kind === "call") return "calls";
  if (alert.ticker) return alert.kind === "ladder" ? "research" : "pulse";
  if (alert.kind === "margin") return "cash";
  return "overview";
}

/** How many rows Home's list draws before pointing at the room. */
export const HOME_ALERTS_SHOWN = 6;

const TONE_RANK: Record<MarginToneName, number> = {
  loss: 0,
  warning: 1,
  neutral: 2,
};

/** First sentence of a detail, for an alert that arrived with no digest. */
function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(text);
  return (m ? m[1] : text).replace(/[.!?]$/, "");
}

/** The kind's own two words, for the fallback row. */
const KIND_TAG: Record<AlertKind, string> = {
  results: "Results",
  strike: "Strike",
  margin: "Borrowed",
  concentration: "Size",
  ladder: "Fair value zones",
  call: "Covered call",
};

/**
 * What Home's list draws: the alerts worth a row, louder ones first and
 * otherwise in the order they arrived, each with its row words.
 *
 * Borrowed money is left out, as it always was on Home (see
 * `HomeAlertList`). A digest is filled in from the title when a builder
 * did not write one, so an alert added later without one still gets a
 * row that says something rather than an empty one.
 */
export function homeAlertRows(
  alerts: UpsideAlert[],
  limit: number = HOME_ALERTS_SHOWN
): {
  shown: Array<{ alert: UpsideAlert; row: AlertDigest }>;
  more: number;
  total: number;
} {
  const eligible = alerts
    .map((alert, i) => ({ alert, i }))
    .filter(({ alert }) => alert.kind !== "margin")
    .sort(
      (a, b) =>
        TONE_RANK[a.alert.tone ?? "neutral"] -
          TONE_RANK[b.alert.tone ?? "neutral"] || a.i - b.i
    )
    .map(({ alert }) => alert);
  const shown = eligible.slice(0, Math.max(0, limit)).map((alert) => ({
    alert,
    row: alert.digest ?? {
      tag: KIND_TAG[alert.kind],
      what: firstSentence(alert.cushion ?? alert.title),
      figure: null,
      note: null,
    },
  }));
  return {
    shown,
    more: eligible.length - shown.length,
    total: eligible.length,
  };
}
