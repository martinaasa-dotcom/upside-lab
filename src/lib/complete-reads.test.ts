import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Reads that have to carry every row they matched.

  PostgREST answers with at most db-max-rows, which this project is set to
  1,000 by default, and it applies that silently: no error, no flag, a
  shorter list. `readAll` (src/lib/supabase/read-all.ts) is the answer, and
  the reason this guard exists is that using it is a decision made once per
  call site and forgotten. Nothing about a `.select()` says whether the rows
  are the whole answer, so a new read added beside a paged one inherits none
  of its care.

  The files below are the ones where a short answer is not a smaller screen
  but a wrong number stated as fact: a class leaderboard whose values were
  computed from part of somebody's portfolio, an email telling a reader
  their portfolio is empty when it is not, a reader's own holdings missing
  from their own total.

  This is a floor, not a ceiling. It covers the tables listed here in the
  files listed here; a completeness-critical read of some other table
  somewhere else is still on whoever writes it.
*/

/** Tables whose rows are the answer rather than a sample of it. */
const MUST_BE_COMPLETE = [
  "holdings",
  "portfolioOwners",
  "portfolios",
  "communityMembers",
  "communityPortfolios",
  "profiles",
  "labState",
  "communities",
];

const GUARDED_FILES = [
  "src/app/api/communities/[id]/book/route.ts",
  "src/app/api/communities/discover/route.ts",
  "src/app/api/portfolios/route.ts",
  "src/lib/empty-book-nudge.ts",
];

/**
 * A read that answers with rows, as opposed to one the database has already
 * reduced to a single row or a number.
 *
 * A `head: true` count sends no rows at all and is the aggregate this guard
 * would otherwise push people away from, so it is explicitly fine. So are
 * `.single()`, `.maybeSingle()` and an explicit `.limit()`, each of which
 * says out loud how much it wants.
 */
function readsManyRows(tail: string): boolean {
  if (!/\.select\(/.test(tail)) return false;
  if (/head:\s*true/.test(tail)) return false;
  if (/count:\s*"exact"/.test(tail)) return false;
  if (/\.maybeSingle\(\)|\.single\(\)/.test(tail)) return false;
  if (/\.limit\(/.test(tail)) return false;
  return true;
}

describe("reads that must carry every row", () => {
  for (const file of GUARDED_FILES) {
    const source = readFileSync(file, "utf8");

    for (const table of MUST_BE_COMPLETE) {
      const marker = `.from(PORTFELL_TABLES.${table})`;
      let at = source.indexOf(marker);
      let nth = 0;

      while (at !== -1) {
        const tail = source.slice(at, at + 420);
        const head = source.slice(Math.max(0, at - 320), at);
        nth += 1;
        const which = `${file} — ${table} read #${nth}`;

        if (readsManyRows(tail)) {
          it(`${which} is paged`, () => {
            expect(
              /readAll[<(]/.test(head),
              `${which} selects rows without readAll, so it stops at ` +
                "db-max-rows and says nothing about having done so."
            ).toBe(true);
          });
        }

        at = source.indexOf(marker, at + marker.length);
      }
    }
  }
});
