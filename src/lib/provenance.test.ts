import { describe, expect, it } from "vitest";
import {
  forecastPathProvenance,
  forecastRoomProvenance,
  pulseProvenance,
  scenarioProvenance,
} from "@/lib/provenance";

describe("provenance", () => {
  it("names the model and today's price on a reasoned forecast path", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 217.39,
      sector: "AI infra / GPU cloud",
      hasOwnReason: true,
    });
    expect(p.maker).toBe("model");
    expect(p.headline).toMatch(/language model/i);
    expect(p.headline).toMatch(/\$NBIS/);
    expect(p.inputs.some((i) => i.what.toLowerCase().includes("today"))).toBe(
      true
    );
    expect(p.inputs.some((i) => /training|already knows/i.test(i.what))).toBe(
      true
    );
    expect(p.blindSpots.some((s) => /news/i.test(s))).toBe(true);
    expect(p.blindSpots.some((s) => /price target/i.test(s))).toBe(true);
  });

  it("names the rest of the portfolio, which the prompt really sends", () => {
    /*
      buildForecastPlanPrompt carries the cash balance, the portfolio total
      and the insight lines about which holdings are the same kind of
      business, on top of the per-name figures. The eye's own rule is that
      its list survives somebody reading the prompt, so a reader checking
      finds them named rather than three inputs it never mentioned.
    */
    const p = forecastPathProvenance({ ticker: "RKLB", spot: 68.65 });
    const inputs = p.inputs.map((i) => `${i.what} ${i.detail ?? ""}`).join(" | ");
    expect(inputs).toMatch(/rest of your portfolio/i);
    expect(inputs).toMatch(/cash/i);
    expect(inputs).toMatch(/same kind of business/i);
    expect(inputs).toMatch(/date/i);
  });

  it("does not pretend a fallback shape is reasoning about the company", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 217.39,
      fallback: true,
    });
    expect(p.maker).toBe("arithmetic");
    expect(p.headline).toMatch(/not reasoning/i);
  });

  it("says Pulse fetched headlines when it did, and says so when it did not", () => {
    const withNews = pulseProvenance({
      ticker: "CRWV",
      hasOwnReason: true,
      headlineCount: 2,
    });
    expect(withNews.inputs.some((i) => /2 headlines/i.test(i.detail ?? ""))).toBe(
      true
    );
    expect(withNews.blindSpots.some((s) => /did not get/i.test(s))).toBe(true);

    const without = pulseProvenance({
      ticker: "CRWV",
      hasOwnReason: false,
      headlineCount: 0,
    });
    expect(without.inputs.some((i) => /none came back/i.test(i.detail ?? ""))).toBe(
      true
    );
  });

  it("keeps the bad-day simulator honest as arithmetic, not a model", () => {
    const p = scenarioProvenance();
    expect(p.maker).toBe("arithmetic");
    expect(p.headline).toMatch(/nobody asked a model/i);
  });

  it("tells a skeptic the Forecast room's years ahead are modeled", () => {
    const p = forecastRoomProvenance({});
    expect(p.maker).toBe("model");
    expect(p.headline).toMatch(/modeled/i);
    expect(p.headline).toMatch(/today/i);
  });
});
