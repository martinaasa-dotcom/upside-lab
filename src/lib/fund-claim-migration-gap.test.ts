import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  The gap between a deploy and its migration.

  The Fund cron claims the day before it trades, which is right. What made
  it dangerous is how the claim reads when the function it calls is not on
  the database yet: `supabase.rpc` answers `{ data: null, error }`, and a
  check written as `data !== true` cannot tell "somebody else has today"
  from "this function does not exist".

  Read the wrong way, code arriving before its migration stops the Fund
  trading altogether, and stops it quietly, because standing down answers
  `ok: true`. Nothing alerts. The only symptom is a feed that has not
  moved, and it lasts until a person notices by eye, which is a worse
  failure than the double run the claim was added to prevent.

  This is the same hazard `note-cron` already handles with
  `missingMarkerColumn`, and it wants the same answer: an absent function
  falls through to the behaviour that shipped for months.
*/

const ROUTE = readFileSync("src/app/api/cron/margus-fund/route.ts", "utf8");

describe("the Fund claim and its migration", () => {
  it("reads the error, rather than only the value", () => {
    // `const { data: claimedRun } = await supabase.rpc(` was the bug: with
    // no error binding there is nothing to tell the two cases apart.
    expect(ROUTE).toMatch(/const \{ data: claimedRun, error: claimErr \}/);
  });

  it("treats an absent function as not-yet-migrated, not as a lost race", () => {
    expect(ROUTE).toContain("missingClaimFunction");
    // Postgres's undefined_function, and PostgREST's own schema-cache miss.
    expect(ROUTE).toContain('"42883"');
    expect(ROUTE).toContain('"PGRST202"');
  });

  /*
    The stand-down has to stay reachable for the case it was written for,
    or fixing the migration gap would quietly undo the claim itself.
  */
  it("still stands down when another worker holds the day", () => {
    expect(ROUTE).toContain("fund_cron_claimed_elsewhere");
    expect(ROUTE).toMatch(/claimedRun !== true/);
  });

  it("says out loud which of the two happened", () => {
    expect(ROUTE).toContain("fund_cron_claim_not_migrated");
    expect(ROUTE).toContain("fund_cron_claim_failed");
  });
});

/*
  The predicate itself, on the shapes a driver actually sends. Copied from
  the route rather than exported, because exporting it from a route module
  would drag the whole handler into this test.
*/
function missingClaimFunction(err: { code?: string; message?: string }): boolean {
  if (err?.code === "42883" || err?.code === "PGRST202") return true;
  const message = String(err?.message ?? "");
  return (
    /portfell_claim_fund_run/.test(message) &&
    /(does not exist|could not find|schema cache)/i.test(message)
  );
}

describe("missingClaimFunction", () => {
  it("recognises the function not being there", () => {
    expect(missingClaimFunction({ code: "42883" })).toBe(true);
    expect(missingClaimFunction({ code: "PGRST202" })).toBe(true);
    expect(
      missingClaimFunction({
        message:
          "Could not find the function public.portfell_claim_fund_run(p_day) in the schema cache",
      })
    ).toBe(true);
    expect(
      missingClaimFunction({
        message: 'function public.portfell_claim_fund_run(date) does not exist',
      })
    ).toBe(true);
  });

  /*
    A real failure must not be waved through as a migration gap, or the
    Fund trades on a day it never actually claimed.
  */
  it("does not wave through a genuine failure", () => {
    expect(missingClaimFunction({ code: "42501", message: "permission denied" })).toBe(false);
    expect(missingClaimFunction({ message: "connection reset" })).toBe(false);
    expect(missingClaimFunction({})).toBe(false);
    // Another function missing is somebody else's problem, not this claim's.
    expect(
      missingClaimFunction({
        message: "Could not find the function public.something_else in the schema cache",
      })
    ).toBe(false);
  });
});
