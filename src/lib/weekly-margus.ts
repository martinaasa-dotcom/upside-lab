/**
 * The person writing the Sunday letter.
 *
 * The email already carries the numbers, the suggestions, and the calendar
 * as their own sections. This adds the two short paragraphs at the top that
 * make it read like someone sat down and wrote it: how the week actually
 * went, and how the rest of the names compared.
 *
 * Fail open. If the model is busy or down, `fallbackWeeklyTake` writes the
 * same two paragraphs from the numbers alone, so the letter always ships.
 */

import { generateText } from "ai";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import {
  beginBackgroundLlm,
  chatIsBusy,
  endBackgroundLlm,
} from "@/lib/ai/llm-slots";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import {
  buildAdvisorProviderChain,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { cashtag, currency, signedCurrency, signedPercent } from "@/lib/format";
import { looksLikePromptLeak } from "@/lib/ai/prompt-leak";
import type { WeeklyLetter } from "@/lib/weekly-letter";

/*
 * Same formatters as the letter itself, from `format.ts`. This file used
 * to carry its own copy of the grouping regex, which is exactly how a
 * figure ends up separated in one half of an email and bare in the other.
 * The model reads these strings, so an ungrouped one here also teaches it
 * to write `$129709` back.
 */
function money(n: number): string {
  return currency(n, 0);
}

function signedMoney(n: number): string {
  return signedCurrency(n, 0);
}

function signedPct(pct: number): string {
  return signedPercent(pct / 100, 1);
}

/** The facts the writer is allowed to use. Nothing else is true. */
function facts(r: WeeklyLetter): string {
  const lines: string[] = [];
  lines.push(`Reader's first name: ${r.name?.split(/\s+/)[0] ?? "(unknown)"}`);
  lines.push(`Portfolio value: ${money(r.book)}`);
  lines.push(`Names held: ${r.nameCount}`);
  lines.push(
    `Week change: ${signedMoney(r.weekDollar)}${
      r.weekPct != null ? ` (${signedPct(r.weekPct)})` : ""
    }`
  );
  if (r.weekPct != null) {
    // The same fact in the unit a person actually feels. Given rather than
    // asked for, so the letter never divides it wrong.
    lines.push(
      `Week change per $100 invested: ${currency(Math.abs(r.weekPct), 2)} ${
        r.weekPct < 0 ? "lost" : "gained"
      } out of every $100`
    );
  }
  if (r.cash !== 0) lines.push(`Cash in the portfolio: ${money(r.cash)}`);
  if (r.movers.length > 0) {
    lines.push("Moves this week:");
    for (const m of r.movers) {
      lines.push(
        `  ${cashtag(m.ticker)} ${signedPct(m.pct)} (${signedMoney(m.dollar)})`
      );
    }
  }
  if (r.suggestions.length > 0) {
    lines.push("Things the app already flagged (do NOT repeat these verbatim):");
    for (const s of r.suggestions) {
      lines.push(`  ${s.kind.toUpperCase()} ${cashtag(s.ticker)}: ${s.line}`);
    }
  }
  if (r.watchRows.length > 0) {
    /*
     * Both directions, not only the fallers.
     *
     * This used to hand over the dips alone, so the letter could name one
     * faller and nothing else: a reader with three watched names down and
     * two up read a sentence about one of them and had to work out from
     * the table underneath that it was not the whole story. The prose
     * summarises the watchlist now, which needs the whole watchlist.
     */
    lines.push("Watchlist moves this week (these are not owned):");
    for (const w of r.watchRows) {
      lines.push(`  ${cashtag(w.ticker)} ${signedPct(w.pct)}`);
    }
  }
  if (r.rest) {
    lines.push(
      `Everything else owned, not listed above: ${r.rest.count} ${
        r.rest.count === 1 ? "company" : "companies"
      }, ${r.rest.up} up and ${r.rest.down} down, biggest move among them ${signedPct(r.rest.maxAbsPct)}`
    );
  }
  if (r.weekAhead.length > 0) {
    lines.push("On next week's calendar:");
    for (const w of r.weekAhead) lines.push(`  ${w}`);
  }
  return lines.join("\n");
}

const JOB = `This is the Sunday letter. It goes out once a week and it is the only email this person gets.

Write four short paragraphs, one blank line between them. No greeting, no sign-off, no subject line, no headings.

Who is reading: someone who has never worked in finance and does not have the words for any of this. Picture a smart 75 year old with a cup of coffee. Every sentence has to land the first time it is read.

It has to read as one person thinking, not as four separate facts stacked up. Each paragraph picks up where the last one left off: the money, then who caused it, then what was pulling the other way, then everything that has not been mentioned yet. A reader should be able to follow it straight down without ever asking why a sentence is there.

Paragraph one. What the week did, in money, and immediately who did it. Lead with the figure, then defuse it in the very next sentence by giving the same thing as dollars out of every $100 they had invested (the facts list has that number, use it as given). Then name the holding that did most of the work and say what it actually does in three or four plain words: "Nvidia, which makes computer chips", "Rocket Lab, which builds rockets". If one company accounts for most of the week, say so in dollars.

Paragraph two. What was pulling the other way, and whether it mattered. Name it, say what the company does, and give the honest size of it against the total. A name that had run a long way giving a little back is not the same thing as a name breaking. If genuinely nothing finished lower, say that instead, in one sentence, and only if the facts list bears it out.

Paragraph three. The watchlist, if there is one in the facts, as a summary of the whole of it in both directions: which of them fell the most and which rose the most, each with its percentage. Never single out one watched name as though it were the only one that moved. These are not owned, so do not describe them as gains or losses.

Last paragraph. Everything not yet named, using the "everything else" line in the facts. If the biggest move left is small, say they were quiet and give that number. If it is not small, do not call it quiet: say how many went up, how many went down, and how big the largest of them was. Stop there. Do not tell them to sit still, hold, or do nothing.

Rules, all of them non-negotiable:
- Everyday company names, not cashtags: "Nvidia", not "$NVDA". If you do not know what a company does, use its name alone. If you do not know the name, use the ticker. Never invent a business or a fact about one.
- Name each company at most once in the whole letter.
- No filler and no proverbs. Never write a line like "a week either way is a week" or "time in the market beats timing the market". Every sentence carries a fact from the list or it does not go in.
- Never call a week, a company or a set of companies quiet unless the numbers in the facts say so.
- Short sentences. No word a grandmother would have to look up, and no market slang: no sleeve, tape, conviction, dry powder, beta, drawdown, rotation, exposure, allocation, volatility.
- Never invent a number, a headline, or a name that is not in the facts. Never name a website or paste a link. Never say we, us, or our. Never write an instruction to buy, sell, hold, add, trim, sit tight, or start small. Describe the price action. Leave every decision with the reader.
- Finish every sentence.`;

/**
 * Under this much, a week's move on one company really is nothing to
 * report. Above it, the closing line has to say what the move was rather
 * than call it quiet.
 */
const QUIET_PCT = 2;

/**
 * A move big enough to be named beside the week's leader rather than
 * folded into the closing line. A holding up 10% is not one of the quiet
 * ones, whatever the sentence at the bottom would like to say.
 */
const ALONGSIDE_PCT = 5;

/** A move worth less than this share of the week barely dented the total. */
const SMALL_SHARE = 0.15;

/** The same letter from the numbers alone, when the model can't be reached. */
export function fallbackWeeklyTake(r: WeeklyLetter): string {
  /*
   * Same shape as the prompt asks the model for, and it has to read as one
   * person thinking rather than as a stack of sentences: what the week did
   * and who did it, what was pulling the other way, the watchlist in both
   * directions, then everything not yet named.
   *
   * Three things this deliberately no longer does, each of them something
   * a reader caught. It does not close on a proverb ("a week either way is
   * a week"), which carried no fact and read as filler bolted onto the end
   * of a paragraph. It does not print a "standout fact" about whichever
   * suggestion happened to be first, which in practice meant the biggest
   * holding, every week, whether or not anything about it had changed;
   * those notes have their own section in the letter with the reader's own
   * Pulse wording on them. And it does not say the rest were quiet unless
   * `r.rest` says they were.
   *
   * It still cannot name companies, only tickers, because nothing here
   * knows what a company does and guessing is worse than a cashtag.
   */
  const named = new Set<string>();
  const paras: string[] = [];

  const bare = (pct: number) => signedPct(pct).replace(/^[+-]/, "");
  const bareMoney = (n: number) => signedMoney(Math.abs(n)).replace(/^[+-]/, "");
  const dirWord = (pct: number) => (pct >= 0 ? "up" : "down");

  /*
   * Small counts are words in prose. "3 up and 1 down" is a table cell
   * that has wandered into a sentence, and the whole letter is judged on
   * whether it reads as something a person wrote.
   */
  const WORDS = [
    "no", "one", "two", "three", "four", "five", "six",
    "seven", "eight", "nine", "ten", "eleven", "twelve",
  ];
  const count = (n: number) => WORDS[n] ?? String(n);

  /** "$A, $B and $C", the way a person lists things out loud. */
  const listOf = (items: string[]): string =>
    items.length <= 1
      ? (items[0] ?? "")
      : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

  /* -------------------------------------------- the week, and who did it */

  const per100 =
    r.weekPct != null
      ? ` That is about ${currency(Math.abs(r.weekPct), 2)} for every $100 you had invested.`
      : "";

  const opening: string[] = [];
  if (r.quiet) {
    opening.push(
      `Your portfolio finished ${signedMoney(r.weekDollar)} this week, which is close enough to flat that it barely counts as news.${per100}`
    );
  } else {
    opening.push(
      `Your portfolio ${r.weekDollar < 0 ? "lost" : "gained"} ${bareMoney(r.weekDollar)} this week.${per100}`
    );
  }

  // Who did the work is a money question, so the leader is picked by the
  // dollars it moved rather than by its percentage: a 20% week on a small
  // holding is not what changed the total.
  const byDollar = [...r.movers].sort(
    (a, b) => Math.abs(b.dollar) - Math.abs(a.dollar)
  );
  const leader = byDollar.find((m) => m.dollar !== 0) ?? r.movers[0];
  if (leader) {
    named.add(leader.ticker);
    const tag = cashtag(leader.ticker);
    const share =
      r.weekDollar !== 0 && leader.dollar !== 0
        ? Math.abs(leader.dollar) / Math.abs(r.weekDollar)
        : 0;
    if (leader.dollar === 0) {
      opening.push(
        `The biggest move was ${tag}, ${dirWord(leader.pct)} ${bare(leader.pct)}.`
      );
    } else if (share >= 0.5) {
      opening.push(
        `Most of that came from ${tag}, ${dirWord(leader.pct)} ${bare(leader.pct)}, which on its own ${
          leader.dollar < 0 ? "took off" : "added"
        } ${bareMoney(leader.dollar)}.`
      );
    } else {
      opening.push(
        `The biggest single move was ${tag}, ${dirWord(leader.pct)} ${bare(leader.pct)}, which by itself accounts for ${bareMoney(leader.dollar)} of that.`
      );
    }

    /*
     * A second big move in the leader's own direction belongs beside it,
     * in the same breath, rather than being swept into the closing line as
     * though it were one of the quiet ones. It cannot go in the paragraph
     * below either: that one is about what pulled the other way, and a
     * sentence saying a name "moved with it" directly after a faller reads
     * as though it fell too.
     */
    const alongside = r.movers.find(
      (m) =>
        !named.has(m.ticker) &&
        Math.sign(m.pct) === Math.sign(leader.pct) &&
        Math.abs(m.pct) >= ALONGSIDE_PCT
    );
    if (alongside) {
      named.add(alongside.ticker);
      opening.push(
        `${cashtag(alongside.ticker)} was ${dirWord(alongside.pct)} ${bare(alongside.pct)} alongside it${
          alongside.dollar === 0
            ? ""
            : alongside.dollar < 0
              ? `, which took off another ${bareMoney(alongside.dollar)}`
              : `, worth another ${bareMoney(alongside.dollar)}`
        }.`
      );
    }
  }
  paras.push(opening.join(" "));

  /* ------------------------------------------ what pulled the other way */

  if (leader) {
    const against: string[] = [];
    const opposite = byDollar.find(
      (m) => m.ticker !== leader.ticker && Math.sign(m.pct) === -Math.sign(leader.pct)
    );
    if (opposite) {
      named.add(opposite.ticker);
      const tag = cashtag(opposite.ticker);
      const small =
        r.weekDollar !== 0 &&
        Math.abs(opposite.dollar) < Math.abs(r.weekDollar) * SMALL_SHARE;
      /*
       * "Barely dented" is what a small loss does to a gain. A small gain
       * inside a losing week has not dented anything, so it says what it
       * actually did, which is fail to make up much of the difference.
       */
      const effect =
        opposite.dollar === 0
          ? ""
          : small
            ? opposite.dollar < 0
              ? ", which barely dented the total"
              : ", which was not enough to make up much of the difference"
            : `, which ${opposite.dollar < 0 ? "took" : "put"} ${bareMoney(opposite.dollar)} ${
                opposite.dollar < 0 ? "back off" : "back on"
              } it`;
      // "The only one" is a fact about the whole portfolio, so it counts
      // the names outside the table too, and is only said when it is true.
      const others =
        r.movers.filter((m) => Math.sign(m.pct) === Math.sign(opposite.pct)).length +
        (opposite.pct < 0 ? (r.rest?.down ?? 0) : (r.rest?.up ?? 0));
      against.push(
        others === 1
          ? `${tag} was the only company you own to finish the week ${
              opposite.pct < 0 ? "lower" : "higher"
            }, ${dirWord(opposite.pct)} ${bare(opposite.pct)}${effect}.`
          : `${tag} pulled the other way, ${dirWord(opposite.pct)} ${bare(opposite.pct)}${effect}.`
      );
    } else if (leader.pct >= 0 && (r.rest?.down ?? 0) === 0) {
      against.push("Nothing you own finished the week lower.");
    } else if (leader.pct < 0 && (r.rest?.up ?? 0) === 0) {
      against.push("Nothing you own finished the week higher.");
    }
    if (against.length > 0) paras.push(against.join(" "));
  }

  /* ------------------------------------------------------- the watchlist */

  /*
   * The whole watchlist, in both directions.
   *
   * This used to name the first name that had fallen and stop, so a reader
   * with three watched names down and two up was told about one of them,
   * and the table underneath disagreed with the prose that introduced it.
   */
  const withPct = (w: { ticker: string; pct: number }) =>
    `${cashtag(w.ticker)} at ${bare(w.pct)}`;
  const watchDown = r.watchRows
    .filter((w) => w.pct < 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);
  const watchUp = r.watchRows
    .filter((w) => w.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);
  const fell =
    watchDown.length > 0
      ? watchDown.length === 1
        ? `${cashtag(watchDown[0].ticker)} finished ${bare(watchDown[0].pct)} cheaper than it was last Sunday`
        : `${cashtag(watchDown[0].ticker)} fell the most, ${bare(watchDown[0].pct)}, then ${listOf(watchDown.slice(1).map(withPct))}`
      : "";
  const rose =
    watchUp.length > 0
      ? watchUp.length === 1
        ? `${cashtag(watchUp[0].ticker)} finished ${bare(watchUp[0].pct)} dearer`
        : `${cashtag(watchUp[0].ticker)} rose the most, ${bare(watchUp[0].pct)}, then ${listOf(watchUp.slice(1).map(withPct))}`
      : "";
  if (fell && rose) {
    paras.push(
      `On your watchlist, the companies you follow but do not own, ${fell}. Going the other way, ${rose}.`
    );
  } else if (fell) {
    paras.push(
      `Everything on your watchlist, which you follow but do not own, finished lower: ${fell}.`
    );
  } else if (rose) {
    paras.push(
      `Everything on your watchlist, which you follow but do not own, finished higher: ${rose}.`
    );
  }

  /* ------------------------------------------------- everything not named */

  const otherMovers = r.movers.filter((m) => !named.has(m.ticker));
  const otherCount = otherMovers.length + (r.rest?.count ?? 0);
  if (otherCount > 0) {
    const biggest = Math.max(
      ...otherMovers.map((m) => Math.abs(m.pct)),
      r.rest?.maxAbsPct ?? 0
    );
    const up = otherMovers.filter((m) => m.pct > 0).length + (r.rest?.up ?? 0);
    const down = otherMovers.filter((m) => m.pct < 0).length + (r.rest?.down ?? 0);
    const companies = otherCount === 1 ? "company" : "companies";
    const other = named.size > 0 ? "other " : "";
    if (biggest < QUIET_PCT) {
      paras.push(
        `The ${other}${count(otherCount)} ${companies} you own barely moved, none of them by more than ${bare(biggest)} in either direction.`
      );
    } else {
      paras.push(
        `That leaves ${count(otherCount)} ${other}${companies}, ${count(up)} up and ${count(down)} down, and the largest move among those was ${bare(biggest)}.`
      );
    }
  }

  return paras.join("\n\n");
}

type Accepted = { text: string } | { rejected: string };

function accept(text: string): Accepted {
  const clean = humanizeMargusText(String(text ?? "")).trim();
  if (!clean) return { rejected: "empty" };
  if (looksLikePromptLeak(clean)) return { rejected: "prompt leak" };
  const paras = clean.split(/\n{2,}/).filter(Boolean);
  // Four short paragraphs is the shape now, not two.
  if (paras.length < 2 || paras.length > 6) {
    return { rejected: `${paras.length} paragraphs` };
  }
  if (clean.length < 80 || clean.length > 2200) {
    return { rejected: `${clean.length} characters` };
  }
  if (!/[.!?]["')\]]?$/.test(clean)) return { rejected: "unfinished sentence" };
  return { text: clean };
}

/**
 * Which of the two wrote this letter, and why.
 *
 * Every reader's letter used to be able to come out of `fallbackWeeklyTake`
 * with nothing anywhere saying so: six separate returns above hand it back
 * silently, for a missing API key, a busy slot, a refused answer or a
 * timeout, and the letter that lands in an inbox looks the same from the
 * outside whichever one fired. A whole Sunday can go out in the plainest
 * prose the product has and the only way to find out is to read the mail.
 * The dispatcher reports this per letter and raises one alarm on a run
 * where the model never wrote a single one.
 */
export type WeeklyTakeOutcome = {
  source: "model" | "fallback";
  /** Short, stable and free of anything about the reader. */
  reason: string;
};

export async function writeWeeklyTake(
  letter: WeeklyLetter,
  /**
   * How long this one letter may spend with the model. The weekly cron
   * writes many letters inside a single 60s function, so it passes whatever
   * its own run has left rather than letting each call take a fixed 22s.
   */
  opts: { budgetMs?: number; onOutcome?: (outcome: WeeklyTakeOutcome) => void } = {}
): Promise<string | null> {
  const say = (source: "model" | "fallback", reason: string) => {
    opts.onOutcome?.({ source, reason });
  };
  const fall = (reason: string) => {
    say("fallback", reason);
    return fallbackWeeklyTake(letter);
  };

  if (chatIsBusy()) return fall("chat holds the model slot");
  if (!beginBackgroundLlm()) return fall("another background job holds the slot");
  const chain = buildAdvisorProviderChain();
  if (chain.length === 0) {
    endBackgroundLlm();
    return fall("no model provider is configured");
  }
  try {
    const { text } = await withAdvisorFallback(
      chain,
      (model, _id, signal) =>
        generateText({
          model,
          system: `${MARGUS_PERSONA}

## This email
${JOB}

Write the finished letter only. The first word you write is the first word of the letter.
Do not restate these rules. Do not list words to avoid. Do not plan out loud.`,
          prompt: facts(letter),
          maxOutputTokens: 640,
          abortSignal: signal,
        }),
      { deadlineAt: Date.now() + (opts.budgetMs ?? 22_000) }
    );
    const verdict = accept(text);
    if ("text" in verdict) {
      say("model", "ok");
      return verdict.text;
    }
    return fall(`answer refused: ${verdict.rejected}`);
  } catch (err) {
    console.error("Weekly letter take failed", err);
    return fall(
      `model call failed: ${err instanceof Error ? err.name : "unknown"}`
    );
  } finally {
    endBackgroundLlm();
  }
}
