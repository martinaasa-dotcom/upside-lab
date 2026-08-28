import { describe, expect, it } from "vitest";
import {
  forecastPathProvenance,
  forecastRoomProvenance,
  forecastTotalProvenance,
  growthRateProvenance,
  holdingsProvenance,
  margusChatProvenance,
  pulseProvenance,
  pulseRoomProvenance,
  scenarioProvenance,
  type Provenance,
} from "@/lib/provenance";
import { describeModelRun, shortModelName } from "@/lib/ai/model-label";

const EVERY: Array<[string, Provenance]> = [
  ["forecast path", forecastPathProvenance({ ticker: "NBIS", spot: 211.11 })],
  [
    "forecast path fallback",
    forecastPathProvenance({ ticker: "NBIS", spot: 211.11, fallback: true }),
  ],
  ["forecast room", forecastRoomProvenance({})],
  ["forecast total", forecastTotalProvenance({})],
  ["pulse", pulseProvenance({ ticker: "CRWV", hasOwnReason: true })],
  ["pulse room", pulseRoomProvenance({})],
  ["scenario", scenarioProvenance()],
  ["margus", margusChatProvenance()],
  ["holdings", holdingsProvenance({})],
  ["growth rate", growthRateProvenance({ ratePct: 23 })],
];

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

  /*
   * The two below are the whole point of this surface. A panel that lists
   * inputs but hides what this app did to the model's answer afterwards is
   * the more convincing kind of dishonest, because it reads like candour.
   */
  it("admits a filled year and a reshaped straight line, separately", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 211.11,
      adjust: { missing: false, filled: true, reshaped: true },
    });
    const steps = (p.steps ?? []).join(" ");
    expect(steps).toMatch(/skipped at least one year/i);
    expect(steps).toMatch(/even ramp/i);
  });

  it("does not claim the reshaping moved where the path ends", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 211.11,
      adjust: { missing: false, filled: false, reshaped: true },
    });
    const steps = (p.steps ?? []).join(" ");
    expect(steps).toMatch(/still the model's own number/i);
    expect(steps).not.toMatch(/scaled up/i);
  });

  it("says out loud when a path was reused from a different run", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 211.11,
      reusedAt: "2026-08-24T09:12:00.000Z",
    });
    const steps = (p.steps ?? []).join(" ");
    expect(steps).toMatch(/not written for your portfolio/i);
    expect(steps).toMatch(/your position size and your own reason did not reach it/i);
  });

  it("leaves the steps alone when the app changed nothing", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 211.11,
      adjust: { missing: false, filled: false, reshaped: false },
    });
    const steps = (p.steps ?? []).join(" ");
    expect(steps).not.toMatch(/scaled up|even ramp|skipped/i);
  });

  it("names the publishers behind the headlines a Pulse card read", () => {
    const p = pulseProvenance({
      ticker: "CRWV",
      hasOwnReason: true,
      headlineCount: 2,
      publishers: ["Reuters", "Barron's", "Reuters"],
    });
    const detail = p.inputs.map((i) => i.detail ?? "").join(" ");
    expect(detail).toMatch(/Reuters/);
    expect(detail).toMatch(/Barron's/);
    // Named once each, not once per headline.
    expect(detail.match(/Reuters/g)?.length).toBe(1);
  });

  it("carries the model through only when a run recorded one", () => {
    const named = forecastPathProvenance({
      ticker: "NBIS",
      spot: 211.11,
      model: { provider: "groq", model: "openai/gpt-oss-20b" },
    });
    expect(describeModelRun(named.model)).toMatch(/gpt-oss-20b/);
    expect(describeModelRun(named.model)).toMatch(/Groq/);

    const unnamed = forecastPathProvenance({ ticker: "NBIS", spot: 211.11 });
    expect(describeModelRun(unnamed.model)).toBeNull();
  });

  it("calls the Growth rate a table rather than a measurement", () => {
    const p = growthRateProvenance({ ratePct: 23 });
    expect(p.maker).toBe("arithmetic");
    expect(p.headline).toMatch(/nobody measured/i);
    expect(p.blindSpots.some((s) => /tax|fee/i.test(s))).toBe(true);

    const typed = growthRateProvenance({ ratePct: 40, edited: true });
    expect(typed.headline).toMatch(/rate you typed/i);
  });

  /*
   * The inverse of the assertion that used to sit here. While the floor
   * existed this file made the panel disclose it; now that it is gone, the
   * job is to stop any copy quietly promising a floor that is not there.
   * A reader told the app has a safety net under every forecast, when it
   * does not, is worse off than one told nothing.
   */
  it("promises no floor under a modeled path, because there is none", () => {
    for (const p of [
      forecastPathProvenance({ ticker: "NBIS", spot: 211.11 }),
      forecastRoomProvenance({}),
    ]) {
      const said = [
        p.headline,
        ...p.inputs.map((i) => `${i.what} ${i.detail ?? ""}`),
        ...(p.steps ?? []),
      ].join(" ");
      expect(said).not.toMatch(/will not show a path that finishes below/i);
      expect(said).not.toMatch(/floor is ours/i);
      expect(said).not.toMatch(/scaled up to meet it/i);
    }
    const detail = forecastPathProvenance({ ticker: "NBIS", spot: 211.11 })
      .inputs.map((i) => i.detail ?? "")
      .join(" ");
    expect(detail).toMatch(/nothing in this app moves its answer afterwards/i);
    expect(detail).toMatch(/below today's price, is shown as it was written/i);
  });

  it("tells a Pulse reader that picking the names is not the model's doing", () => {
    const steps = (pulseRoomProvenance({}).steps ?? []).join(" ");
    expect(steps).toMatch(/no model is involved in choosing them/i);
  });

  /*
   * A blanket rule rather than a per-surface assertion, so a surface added
   * later cannot ship half an answer. Every panel has to say who made the
   * number, what went in, where it came from and what it cannot know.
   */
  it.each(EVERY)("%s answers all four questions", (_name, p) => {
    expect(p.headline.length).toBeGreaterThan(20);
    expect(p.inputs.length).toBeGreaterThan(0);
    expect(p.sources?.length ?? 0).toBeGreaterThan(0);
    expect(p.blindSpots.length).toBeGreaterThan(0);
  });

  it.each(EVERY)("%s says a model wrote it, or says nothing did", (_name, p) => {
    // Arithmetic surfaces are the ones a skeptic most needs to be able to
    // rule out, so they have to deny a model rather than just omit one.
    if (p.maker !== "model") {
      const said = `${p.headline} ${(p.steps ?? []).join(" ")}`;
      expect(said).toMatch(
        /no model|nobody asked a model|not a model|nobody measured|rate you typed|written into this app|plain arithmetic|table/i
      );
    }
  });
});

describe("describeModelRun", () => {
  it("names the maker and the host when they differ", () => {
    expect(
      describeModelRun({ provider: "groq", model: "openai/gpt-oss-120b" })
    ).toBe("gpt-oss-120b, built by OpenAI and run by Groq");
  });

  it("does not say a thing twice when the maker is the host", () => {
    expect(
      describeModelRun({ provider: "gemini", model: "gemini-flash-latest" })
    ).toBe("gemini-flash-latest, run by Google");
  });

  it("refuses to invent a name for a run that recorded none", () => {
    expect(describeModelRun(null)).toBeNull();
    expect(describeModelRun({ provider: "groq" })).toBeNull();
    expect(describeModelRun({ provider: "groq", model: "  " })).toBeNull();
  });

  it("strips the vendor prefix and the free tier suffix", () => {
    expect(shortModelName("nvidia/nemotron-3-super-120b-a12b:free")).toBe(
      "nemotron-3-super-120b-a12b"
    );
    expect(shortModelName("gpt-oss-120b")).toBe("gpt-oss-120b");
  });
});
