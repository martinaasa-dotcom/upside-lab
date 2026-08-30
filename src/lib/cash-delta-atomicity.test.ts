import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/*
  Cash moves by a delta the database applies, never by a total Node worked
  out first.

  Migration 041 exists because the trade path used to SELECT a balance, add
  to it here, and UPDATE the absolute result. Two writers read the same
  starting figure and the second overwrites the first, so a balance quietly
  loses a trade. `portfell_apply_cash_delta` does the arithmetic in one
  statement and the trade path has called it ever since.

  The pattern survived somewhere else. Changing a classroom's starting cash
  read every student sheet's `cash_balance`, added the delta in Node and
  wrote the total back, which is the same lost update in the one place it
  is most likely to happen: a teacher changes the figure while thirty
  students are trading, and a student who buys between the read and the
  write has that trade erased.

  Setting cash to a figure the reader stated is a different thing and stays
  a plain write. A CSV or a screenshot saying "cash is $4,000" is an
  instruction to store $4,000, not to add anything to what is there.
*/

const ROUTES = execFileSync(
  "grep",
  ["-rl", "--include=route.ts", "-e", "", "src/app/api"],
  { encoding: "utf8" }
)
  .trim()
  .split("\n");

describe("cash never moves by a total computed in Node", () => {
  it("has no route adding to a balance it read and writing the sum back", () => {
    const offenders: string[] = [];

    for (const file of ROUTES) {
      const source = readFileSync(file, "utf8");
      /*
        `cash_balance:` whose value expression both reads a balance and adds
        to it, in either order: `x.cash_balance + delta` and
        `delta + x.cash_balance` are the same bug. Setting cash to a stated
        figure (`cash_balance: roundMoney(cash)`) has neither and is left
        alone, which is what makes this narrow enough to be worth having.
      */
      const re = /cash_balance:\s*(?:[^;]{0,200}?)cash_balance[^;]{0,80}?\+|cash_balance:\s*(?:[^;]{0,200}?)\+[^;]{0,80}?cash_balance/gs;
      let m: RegExpExecArray | null;
      while ((m = re.exec(source))) {
        offenders.push(`${file}:${source.slice(0, m.index).split("\n").length}`);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  /*
    Naming the route the bug was in, so a revert is caught by more than the
    pattern above. A class's starting cash is a delta applied per sheet.
  */
  it("applies a classroom starting-cash change through the delta RPC", () => {
    const source = readFileSync(
      "src/app/api/communities/[id]/route.ts",
      "utf8"
    );

    expect(source).toContain("applyPortfolioCashDelta");
    expect(source).not.toMatch(/cash_balance:\s*roundMoney\(/);
  });

  /*
    The RPC is the only writer of a relative change, so it must keep doing
    the arithmetic in SQL rather than handing a total back to be written.
  */
  it("keeps the arithmetic inside the migration", () => {
    const sql = readFileSync(
      "supabase/migrations/041_atomic_cash_delta.sql",
      "utf8"
    );

    expect(sql).toMatch(/set cash_balance = round\(\s*\(coalesce\(cash_balance, 0\) \+/);
  });
});
