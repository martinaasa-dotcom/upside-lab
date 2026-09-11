import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { execSync } from "node:child_process";

import { GLOSSARY, glossaryEntry } from "@/lib/glossary";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * The rooms a beginner opens every day, against the rooms they open once.
 *
 * Counted before this test was written: the Upside Fund, which somebody
 * visits out of curiosity and rarely returns to, carried thirteen
 * definitions, and the portfolio table eight. Home, Pulse, Lab, Growth,
 * Forecast, Risk and Circle carried none at all. The glossary was written
 * and tested and reachable; it was reachable mostly from the rooms nobody
 * was standing in.
 */
const DAILY_ROOMS: [string, string][] = [
  ["Home", "src/components/OverviewDashboard.tsx"],
  ["Pulse", "src/components/PulsePage.tsx"],
  ["Lab", "src/components/LabSheet.tsx"],
  ["Growth", "src/components/CompoundInterestSheet.tsx"],
];

/**
 * Every glossary id an `Explain` or a `TermTip` in this file can open.
 *
 * Both spellings, because Home picks its word from the figure: a reader
 * whose cash has gone negative gets `borrowed` and everybody else gets
 * `cash`, written as `term={cond ? "borrowed" : "cash"}`. Matching only
 * the plain attribute would report that room as teaching neither.
 */
function termsIn(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/term=(?:"([a-z0-9-]+)"|\{([^}]*)\})/g)) {
    if (m[1]) {
      out.push(m[1]);
      continue;
    }
    for (const q of (m[2] ?? "").matchAll(/"([a-z0-9-]+)"/g)) out.push(q[1]!);
  }
  return out;
}

describe("the words are where the beginner already is", () => {
  it("gives every daily room at least one word it can explain", () => {
    for (const [room, file] of DAILY_ROOMS) {
      expect(termsIn(read(file)).length, `${room} has no definitions`).toBeGreaterThan(0);
    }
  });

  it("names only words the glossary actually knows", () => {
    /*
      A `term` the glossary has never heard of renders as plain text with
      no affordance, which looks exactly like a room nobody wired up. It
      fails loudly here instead.
    */
    const unknown: string[] = [];
    for (const [room, file] of DAILY_ROOMS) {
      for (const term of termsIn(read(file))) {
        if (!glossaryEntry(term)) unknown.push(`${room}: ${term}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("teaches the words a beginner meets first", () => {
    /*
      Named one by one rather than counted, because the count is satisfied
      by any four words and these are the four that decide whether
      somebody can read their own first screen: what the whole thing has
      made, what a day's move is, how much of everything sits in one
      company, and what borrowed money is.
    */
    const everywhere = DAILY_ROOMS.map(([, file]) => termsIn(read(file))).flat();
    for (const term of ["total-return", "today", "share-of-portfolio", "cash"]) {
      expect(everywhere, `${term} is not reachable from a daily room`).toContain(
        term
      );
    }
  });

  it("keeps borrowed money explainable, since that is the one that can end badly", () => {
    // Home swaps the label when cash goes negative, so both ids are there.
    expect(read("src/components/OverviewDashboard.tsx")).toMatch(
      /term=\{totals\.cash < 0 \? "borrowed" : "cash"\}/
    );
  });

  it("keeps the glossary reachable, and names the entries that are not", () => {
    /*
      An entry nothing links to is the `streaks.ts` shape again: written,
      tested, and unreadable by anybody. The unreachable set is asserted by
      name rather than by count, so adding an entry without a home fails
      here with the word in the message instead of drifting upwards
      unnoticed.

      A key can be a literal in markup or a string in a data module
      (`readings.ts`, `alerts.ts`, `playbook.ts` all pass them as
      variables), so the search is for the id anywhere outside the glossary
      itself rather than for a `term=` attribute.
    */
    const unreachable = GLOSSARY.map((e) => e.id).filter((id) => {
      const hits = execSync(
        `grep -rlF '"${id}"' src --include=*.ts --include=*.tsx | grep -v glossary | grep -v '\\.test\\.' || true`
      )
        .toString()
        .trim();
      return hits === "";
    });
    expect(unreachable).toEqual(["premium"]);
  });
});
