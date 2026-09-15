import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anchorsFor,
  anchorsSettled,
  ensureCompanyAnchors,
  resetCompanyAnchorPool,
} from "@/lib/company-anchor-pool";

/**
 * The pool is the browser's half of "one company, one fair value": every
 * room that draws a price ladder reads it, so what it must never do is
 * ask the same question twice at once, hand out an answer with no way to
 * go stale, or leave a room waiting forever on a route that is down.
 */
const anchor = {
  price: 120,
  kind: "estimate" as const,
  said: "$120.00, the blended estimate.",
  high: 150,
  low: 100,
};

describe("the shared company anchor pool", () => {
  let calls: string[];

  beforeEach(() => {
    resetCompanyAnchorPool();
    calls = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({ anchors: { NBIS: anchor } }),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks once and shares the answer", async () => {
    await ensureCompanyAnchors(["NBIS", "MU"]);
    expect(calls).toHaveLength(1);
    expect(anchorsFor(["NBIS"]).NBIS?.price).toBe(120);
    // A second room wanting the same names asks nobody.
    await ensureCompanyAnchors(["NBIS", "MU"]);
    expect(calls).toHaveLength(1);
  });

  it("remembers a name the feed had nothing for, rather than re-asking forever", async () => {
    await ensureCompanyAnchors(["MU"]);
    expect(anchorsFor(["MU"]).MU).toBeUndefined();
    expect(anchorsSettled(["MU"])).toBe(true);
    await ensureCompanyAnchors(["MU"]);
    expect(calls).toHaveLength(1);
  });

  it("settles on a failed ask, so a room falls back instead of waiting", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await ensureCompanyAnchors(["NBIS"]);
    expect(anchorsSettled(["NBIS"])).toBe(true);
    expect(anchorsFor(["NBIS"]).NBIS).toBeUndefined();
  });

  it("nothing to ask about is settled, not pending", () => {
    expect(anchorsSettled([])).toBe(true);
  });
});
