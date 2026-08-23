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
import { cashtag } from "@/lib/format";
import { looksLikePromptLeak } from "@/lib/ai/prompt-leak";
import type { WeeklyLetter } from "@/lib/weekly-letter";

function groupUs(n: number): string {
  const neg = n < 0;
  const grouped = String(Math.round(Math.abs(n))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ","
  );
  return `${neg ? "-" : ""}${grouped}`;
}

function signedMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${groupUs(Math.abs(n))}`;
}

function signedPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** The facts the writer is allowed to use. Nothing else is true. */
function facts(r: WeeklyLetter): string {
  const lines: string[] = [];
  lines.push(`Reader's first name: ${r.name?.split(/\s+/)[0] ?? "(unknown)"}`);
  lines.push(`Portfolio value: $${groupUs(r.book)}`);
  lines.push(`Names held: ${r.nameCount}`);
  lines.push(
    `Week change: ${signedMoney(r.weekDollar)}${
      r.weekPct != null ? ` (${signedPct(r.weekPct)})` : ""
    }`
  );
  if (r.cash !== 0) lines.push(`Cash in the portfolio: $${groupUs(r.cash)}`);
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

Write exactly two short paragraphs, one blank line between them. No greeting, no sign-off, no subject line, no headings.

Paragraph one: how the week actually went. Lead with the dollar and percent. Name who did the work and who dragged, with cashtags. Name each cashtag at most once in the whole letter.

Paragraph two: what to think about going into next week. If the facts list flagged something worth adding, trimming, or selling, say the thought behind it in your own words rather than repeating the flag. If the facts list has watchlist names that fell, you may mention one as something that got cheaper. If nothing needs doing, say so plainly and mean it: most weeks the right move is none.

Keep it short. Eight sentences across both paragraphs is plenty. Write the way you would to a friend who is smart but does not work in finance: no jargon, no market slang, no words like sleeve, tape, conviction, dry powder, beta, drawdown, or rotation. Say the plain thing.

Never invent a number, a headline, or a name that is not in the facts. Never name a website or paste a link. Never say we, us, or our. Finish every sentence.`;

/** Two paragraphs from the numbers alone, when the model can't be reached. */
export function fallbackWeeklyTake(r: WeeklyLetter): string {
  const best = r.movers.find((m) => m.pct > 0);
  const worst = [...r.movers].reverse().find((m) => m.pct < 0);

  const first: string[] = [];
  if (r.quiet) {
    first.push(
      `A quiet week. Your portfolio finished ${signedMoney(r.weekDollar)}${
        r.weekPct != null ? `, ${signedPct(r.weekPct)}` : ""
      }, which is close enough to flat that it barely counts as news.`
    );
  } else {
    first.push(
      `Your portfolio finished the week ${signedMoney(r.weekDollar)}${
        r.weekPct != null ? `, ${signedPct(r.weekPct)}` : ""
      }.`
    );
    if (best) {
      first.push(
        `${cashtag(best.ticker)} did the most work, up ${signedPct(best.pct).replace("+", "")}.`
      );
    }
    if (worst && worst.ticker !== best?.ticker) {
      first.push(
        `${cashtag(worst.ticker)} went the other way, down ${signedPct(worst.pct).replace("-", "")}.`
      );
    }
  }

  const second: string[] = [];
  const sell = r.suggestions.find((s) => s.kind === "sell");
  const trim = r.suggestions.find((s) => s.kind === "trim");
  const add = r.suggestions.find((s) => s.kind === "add");
  if (sell) {
    second.push(
      `The one thing worth sitting with this week is ${cashtag(sell.ticker)}. The reason you bought it does not look like it still holds, and that is worth an honest answer rather than a shrug.`
    );
  } else if (trim) {
    second.push(
      `${cashtag(trim.ticker)} has grown into a big share of what you own. That is a good problem, but it does mean one company is deciding a lot of your outcome.`
    );
  } else if (add) {
    second.push(
      `${cashtag(add.ticker)} is still small in your portfolio and still doing what you hoped it would.`
    );
  }
  const watch = r.watchBuys[0];
  if (watch) {
    second.push(
      `${cashtag(watch.ticker)} on your watchlist is cheaper than it was on Monday, if you have been waiting for that.`
    );
  }
  if (second.length === 0) {
    second.push(
      "Nothing here needs you to do anything. Most weeks are like that, and sitting still is a real decision, not a missed one."
    );
  } else {
    second.push("Nothing here is urgent. Next Sunday is soon enough.");
  }

  return `${first.join(" ")}\n\n${second.join(" ")}`;
}

function accept(text: string): string | null {
  const clean = humanizeMargusText(String(text ?? "")).trim();
  if (!clean) return null;
  if (looksLikePromptLeak(clean)) return null;
  const paras = clean.split(/\n{2,}/).filter(Boolean);
  if (paras.length < 1 || paras.length > 3) return null;
  if (clean.length < 80 || clean.length > 1600) return null;
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
