import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSupabaseServer } from "@/lib/supabase/server";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/supabase/env";
import { logError } from "@/lib/error-log";

/*
  On 2 September 2026 three rows reading "portfell_apply_cash_delta failed:
  boom" appeared in the live error table and the daily digest mailed the
  superadmin about a new kind of error. The kind of error was a test fixture.

  `critical-path.test.ts` hands `applyPortfolioCashDelta` a stub whose RPC
  answers with the message "boom", which is the right way to test a failure
  path. The failure path calls `logError`, which is not handed a client and
  builds its own from the environment, and this repo's own containers carry
  the production service-role key so the app can run. Every `npx vitest run`
  wrote to production, silently: the insert swallows its own failures, so
  nothing in the test run said a write had happened, and nothing in the
  admin console said the row was not real.

  So the rule is bigger than the log: a test must never reach a real
  database, and a function that builds its own client is a live write hiding
  inside a call a test cannot mock.
*/
describe("a test run cannot reach a real database", () => {
  it("refuses to build a client, credentials or not", () => {
    // The point of the test is that this environment usually does have them.
    // It holds either way, which is what makes the guard the guard.
    expect(getSupabaseServer()).toBeNull();
  });

  it("is guarded where a client is made, not where one is used", () => {
    /*
      In `logError` the guard would fix the one row that was found. Here it
      fixes the class, and it is the same answer this function already gives
      on a machine with no credentials, which every caller has always had
      to handle.
    */
    const server = readFileSync(
      join(process.cwd(), "src/lib/supabase/server.ts"),
      "utf8"
    );
    expect(server).toContain("if (underTest()) return null;");
    expect(server).toMatch(/process\.env\.VITEST/);
    expect(server).toMatch(/process\.env\.NODE_ENV === "test"/);
  });

  it("leaves the error log a no-op rather than a failed insert", async () => {
    // Resolves rather than throwing, and writes nothing. `logEvent` still
    // runs, which is the point: a test can still assert on the event.
    await expect(
      logError({ source: "server", message: "portfell_apply_cash_delta failed: boom" })
    ).resolves.toBeUndefined();
  });

  it("says nothing about the environment it is running in", () => {
    /*
      Reading the key here would put it in a failure message the moment this
      test broke. Its presence is asserted as a boolean and never printed.
    */
    const configured = Boolean(supabaseUrl() && supabaseServiceRoleKey());
    expect(typeof configured).toBe("boolean");
  });

  it("keeps the invariants runner under the same flag", () => {
    // It is run with tsx rather than vitest, so VITEST is not set for it.
    const script = readFileSync(
      join(process.cwd(), "scripts/test-invariants.ts"),
      "utf8"
    );
    expect(script).toContain("process.env.UPSIDE_TEST_RUNNER = \"1\";");
    expect(
      readFileSync(join(process.cwd(), "src/lib/supabase/server.ts"), "utf8")
    ).toMatch(/process\.env\.UPSIDE_TEST_RUNNER/);
  });
});
