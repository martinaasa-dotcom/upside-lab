import { describe, expect, it } from "vitest";
import {
  OPEN_RESEARCH_PER_MINUTE,
  limitOpenResearchRequest,
} from "@/lib/research/public-access";
import { isOpenResearchTicker } from "@/lib/research/universe";

/**
 * A company page is public, and one kind of it costs a provider call the
 * first time anybody opens it: a company off the published list. Those,
 * and only those, are capped per caller, so a link somebody was sent opens
 * at once and a script walking the alphabet does not.
 */
function req(path: string, ip: string, method = "GET"): Request {
  return new Request(`https://upsidelab.app${path}`, {
    method,
    headers: { "x-vercel-forwarded-for": ip },
  });
}

describe("which symbols have a public page", () => {
  it("opens any symbol shaped like a listing, and nothing else", () => {
    expect(isOpenResearchTicker("NVDA")).toBe(true);
    expect(isOpenResearchTicker("NBIS")).toBe(true);
    expect(isOpenResearchTicker("hello world")).toBe(false);
    expect(isOpenResearchTicker("")).toBe(false);
    expect(isOpenResearchTicker("../../etc")).toBe(false);
  });
});

describe("the cap on company pages off the published list", () => {
  it("never counts a company on the published list", () => {
    for (let i = 0; i < OPEN_RESEARCH_PER_MINUTE + 5; i += 1) {
      expect(limitOpenResearchRequest(req("/stock/NVDA", "10.0.0.1"))).toBeNull();
    }
  });

  it("counts companies off it, per caller, and stops the walk", () => {
    let last = null as ReturnType<typeof limitOpenResearchRequest>;
    for (let i = 0; i < OPEN_RESEARCH_PER_MINUTE; i += 1) {
      last = limitOpenResearchRequest(req(`/stock/ZQ${i}`, "10.0.0.2"));
      expect(last?.ok).toBe(true);
    }
    last = limitOpenResearchRequest(req("/stock/ZQX", "10.0.0.2"));
    expect(last?.ok).toBe(false);
    // Somebody else is not affected.
    expect(limitOpenResearchRequest(req("/stock/ZQX", "10.0.0.3"))?.ok).toBe(true);
  });

  it("leaves every other path and every write alone", () => {
    expect(limitOpenResearchRequest(req("/pulse", "10.0.0.4"))).toBeNull();
    expect(limitOpenResearchRequest(req("/research", "10.0.0.4"))).toBeNull();
    expect(limitOpenResearchRequest(req("/stock/ZQZ", "10.0.0.4", "POST"))).toBeNull();
  });
});
