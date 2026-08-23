/**
 * The person writing the Sunday letter.
 *
 * The email already carries the numbers, the suggestions, and the calendar
 * as their own sections. This adds the two short paragraphs at the top that
 * make it read like someone sat down and wrote it: how the week actually
 * went, and what they'd think about going into the next one.
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
  if (r.watchBuys.length > 0) {
    lines.push("Watchlist names that fell this week:");
    for (const w of r.watchBuys) {
      lines.push(`  ${cashtag(w.ticker)} ${signedPct(w.pct)}`);
    }
  }
  if (r.weekAhead.length > 0) {
    lines.push("On next week's calendar:");
    for (const w of r.weekAhead) lines.push(`  ${w}`);
  }
  return lines.join("\n");
}

const JOB = `This is the Sunday letter. It goes out once a week and it is the only email this person gets.

Write four or five short paragraphs, one blank line between them. No greeting, no sign-off, no subject line, no headings.

Who is reading: someone who has never worked in finance and does not have the words for any of this. Picture a smart 75 year old with a cup of coffee. Every sentence has to land the first time it is read.

Paragraph one. What the week did, in money. Lead with the figure, then defuse it in the very next sentence by giving the same thing as dollars out of every $100 they had invested (the facts list has that number, use it as given). A big red figure left sitting on its own is the whole reason people dread this email.

Paragraph two. Where it came from. Name the one or two holdings that did most of the work, and the first time you name a company say what it actually does in three or four plain words: "Nvidia, which makes computer chips", "Rocket Lab, which builds rockets". Then give the honest reason it is or is not something to worry about. A name that had run a long way giving a little back is not the same thing as a name breaking.

Paragraph three. The other side of the week, if there is one: something that went the other way, what that company does, and whether it was big enough to change the total. If a small holding jumped, say plainly that a small holding jumping does not move much.

Paragraph four. The one thing worth thinking about, if the facts list flagged one, and say out loud that it is the only one. Say the thought behind it in your own words, and say what deciding it would actually cost them, which is usually very little.

Last paragraph. Permission to stop. Everything else can be left exactly as it is, and nothing needs doing. If the whole week needs nothing at all, say that plainly and end there.

Rules, all of them non-negotiable:
- Everyday company names, not cashtags: "Nvidia", not "$NVDA". If you do not know what a company does, use its name alone. If you do not know the name, use the ticker. Never invent a business or a fact about one.
- Name each company at most once in the whole letter.
- Short sentences. No word a grandmother would have to look up, and no market slang: no sleeve, tape, conviction, dry powder, beta, drawdown, rotation, exposure, allocation, volatility.
- Never invent a number, a headline, or a name that is not in the facts. Never name a website or paste a link. Never say we, us, or our. Never write an instruction to buy or sell: say the thought, and leave the decision with the reader.
- Finish every sentence.`;

/** Two paragraphs from the numbers alone, when the model can't be reached. */
export function fallbackWeeklyTake(r: WeeklyLetter): string {
  const best = r.movers.find((m) => m.pct > 0);
  const worst = [...r.movers].reverse().find((m) => m.pct < 0);
  const paras: string[] = [];

  /*
   * Same shape as the prompt asks the model for: the figure, then the same
   * figure as dollars per $100, then who did it, then the one decision,
   * then permission to stop. This runs whenever the model is busy or down,
   * and a reader should not be able to tell which one wrote their letter.
   * It cannot name companies, only tickers, because nothing here knows
   * what a company does and guessing is worse than a cashtag.
   */
  const per100 =
    r.weekPct != null
      ? ` That works out to about ${currency(Math.abs(r.weekPct), 2)} out of every $100 you had invested.`
      : "";

  if (r.quiet) {
    paras.push(
      `This week your portfolio finished ${signedMoney(r.weekDollar)}, which is close enough to flat that it barely counts as news.${per100}`
    );
  } else if (r.weekDollar < 0) {
    paras.push(
      `This week your portfolio lost ${signedMoney(Math.abs(r.weekDollar)).replace("+", "")}.${per100}`
    );
  } else {
    paras.push(
      `This week your portfolio gained ${signedMoney(Math.abs(r.weekDollar)).replace("+", "")}.${per100}`
    );
  }

  const middle: string[] = [];
  if (best) {
    middle.push(
      `${cashtag(best.ticker)} did the most work, up ${signedPct(best.pct).replace("+", "")}.`
    );
  }
  if (worst && worst.ticker !== best?.ticker) {
    middle.push(
      `${cashtag(worst.ticker)} went the other way, down ${signedPct(worst.pct).replace("-", "")}.`
    );
  }
  if (middle.length > 0) {
    middle.push(
      "A week either way is a week, not a change in why you own any of it."
    );
    paras.push(middle.join(" "));
  }

  const sell = r.suggestions.find((s) => s.kind === "sell");
  const trim = r.suggestions.find((s) => s.kind === "trim");
  const add = r.suggestions.find((s) => s.kind === "add");
  if (sell) {
    paras.push(
      `Looking ahead, there is really only one thing worth thinking about: ${cashtag(sell.ticker)}. You already decided the reason you bought it no longer holds, and it is small enough that settling it costs you very little either way.`
    );
  } else if (trim) {
    paras.push(
      `Looking ahead, there is really only one thing worth thinking about: ${cashtag(trim.ticker)} has grown into a large share of what you own. That is a good problem, and it does mean one company now decides a lot of your result.`
    );
  } else if (add) {
    paras.push(
      `Looking ahead, there is really only one thing worth thinking about: ${cashtag(add.ticker)} is still a small part of what you own and still doing what you hoped it would.`
    );
  }

  const watch = r.watchBuys[0];
  if (watch) {
    paras.push(
      `${cashtag(watch.ticker)}, which you have been watching, is cheaper than it was last Sunday, if that is something you were waiting for.`
    );
  }

  paras.push(
    paras.length > 1
      ? "Everything else can stay exactly as it is. Nothing here needs you to do anything today."
      : "Nothing here needs you to do anything. Most weeks are like that, and sitting still is a real decision, not a missed one."
  );

  return paras.join("\n\n");
}

function accept(text: string): string | null {
  const clean = humanizeMargusText(String(text ?? "")).trim();
  if (!clean) return null;
  if (looksLikePromptLeak(clean)) return null;
  const paras = clean.split(/\n{2,}/).filter(Boolean);
  // Four or five short paragraphs is the shape now, not two.
  if (paras.length < 2 || paras.length > 6) return null;
  if (clean.length < 80 || clean.length > 2200) return null;
  if (!/[.!?]["')\]]?$/.test(clean)) return null;
  return clean;
}

export async function writeWeeklyTake(
  letter: WeeklyLetter,
  /**
   * How long this one letter may spend with the model. The weekly cron
   * writes many letters inside a single 60s function, so it passes whatever
   * its own run has left rather than letting each call take a fixed 22s.
   */
  opts: { budgetMs?: number } = {}
): Promise<string | null> {
  if (chatIsBusy()) return fallbackWeeklyTake(letter);
  if (!beginBackgroundLlm()) return fallbackWeeklyTake(letter);
  const chain = buildAdvisorProviderChain();
  if (chain.length === 0) {
    endBackgroundLlm();
    return fallbackWeeklyTake(letter);
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
    return accept(text) ?? fallbackWeeklyTake(letter);
  } catch (err) {
    console.error("Weekly letter take failed", err);
    return fallbackWeeklyTake(letter);
  } finally {
    endBackgroundLlm();
  }
}
