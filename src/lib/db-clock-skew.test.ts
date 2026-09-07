import { describe, expect, it } from "vitest";
import {
  clockSkewMessage,
  isCredentialClockRejection,
  withClockSkewRetry,
} from "./db-clock-skew";

/*
  The rule this file holds is the narrowness, not the retrying. A retry that
  quietly widened to timeouts or connection resets would be a retry over
  failures that may already have written a row, and the nightly snapshot is
  one of the two callers.
*/
describe("credential clock rejections", () => {
  it("recognises the shapes PostgREST answers with", () => {
    // The one that actually happened, 2026-09-07.
    expect(
      isCredentialClockRejection({ code: "PGRST303", message: "JWT issued at future" })
    ).toBe(true);
    // The same skew with the sign flipped, on a credential with years left.
    expect(isCredentialClockRejection({ code: "PGRST301", message: "JWT expired" })).toBe(
      true
    );
    // A driver that dropped the code still carries the sentence.
    expect(isCredentialClockRejection(new Error("JWT issued at future"))).toBe(true);
  });

  it("refuses every failure that may already have run a statement", () => {
    for (const other of [
      new Error("fetch failed"),
      new Error("canceling statement due to statement timeout"),
      { code: "42703", message: "column does not exist" },
      { code: "23505", message: "duplicate key value violates unique constraint" },
      { code: "PGRST116", message: "no rows returned" },
      null,
      undefined,
      "JWT issued at future",
    ]) {
      expect(isCredentialClockRejection(other)).toBe(false);
    }
  });
});

describe("withClockSkewRetry", () => {
  const skew = () =>
    Object.assign(new Error("JWT issued at future"), { code: "PGRST303" });

  it("returns the answer once the clocks agree again", async () => {
    let calls = 0;
    const slept: number[] = [];
    const out = await withClockSkewRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw skew();
        return "book";
      },
      { sleep: async (ms) => void slept.push(ms) }
    );
    expect(out).toBe("book");
    expect(calls).toBe(3);
    expect(slept.length).toBe(2);
    // It waits, rather than spending all three attempts inside one second.
    expect(slept.every((ms) => ms > 0)).toBe(true);
  });

  it("rethrows anything else on the first attempt, untouched", async () => {
    let calls = 0;
    await expect(
      withClockSkewRetry(async () => {
        calls += 1;
        throw new Error("fetch failed");
      })
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(1);
  });

  it("gives up rather than waiting out a real fault, and says which it was", async () => {
    let calls = 0;
    const slept: number[] = [];
    await expect(
      withClockSkewRetry(
        async () => {
          calls += 1;
          throw skew();
        },
        { sleep: async (ms) => void slept.push(ms) }
      )
    ).rejects.toThrow(/issued-at/);
    expect(calls).toBe(3);
  });

  it("keeps the provider's own words in front of the explanation", () => {
    const said = clockSkewMessage(skew());
    expect(said.startsWith("JWT issued at future")).toBe(true);
    // Three words in a digest mail tell Martin nothing about where to look.
    expect(said).toContain("Supabase");
  });
});
