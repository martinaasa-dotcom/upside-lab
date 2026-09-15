import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  forecastPathProvenance,
  forecastRoomProvenance,
  forecastTotalProvenance,
  growthRateProvenance,
  bandMapProvenance,
  planLadderProvenance,
  researchQuestionsProvenance,
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
  [
    "forecast path, house account's own plan",
    forecastPathProvenance({
      ticker: "NBIS",
      spot: 211.11,
      houseTargeted: true,
    }),
  ],
  ["forecast room", forecastRoomProvenance({})],
  ["forecast total", forecastTotalProvenance({})],
  ["pulse", pulseProvenance({ ticker: "CRWV" })],
  ["pulse room", pulseRoomProvenance({})],
  ["scenario", scenarioProvenance()],
  ["margus", margusChatProvenance()],
  ["holdings", holdingsProvenance({})],
  ["growth rate", growthRateProvenance({ ratePct: 23 })],
  ["price ladder", planLadderProvenance({ ticker: "GOOGL" })],
  ["price ladder, edited", planLadderProvenance({ ticker: "GOOGL", edited: true })],
  ["four questions", researchQuestionsProvenance({ ticker: "GOOGL" })],
  ["band map", bandMapProvenance({ count: 12 })],
  [
    "four questions with the model's own case against",
    researchQuestionsProvenance({ ticker: "GOOGL", usesModel: true }),
  ],
];

describe("provenance", () => {
  it("names the model and today's price on a reasoned forecast path", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 217.39,
      sector: "AI infra / GPU cloud",
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
      business, on top of the per-name figures. The mark's own rule is that
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

  it("names the house account's own plan honestly, distinct from the model and the plain shape", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 217.39,
      houseTargeted: true,
    });
    expect(p.maker).toBe("arithmetic");
    expect(p.headline).toMatch(/not a model/i);
    expect(p.headline).toMatch(/this app's own account/i);
    // Never claim the reader chose it, and always say they can override it.
    expect(p.headline).not.toMatch(/you\s+(typed|wrote|chose)/i);
    expect(p.yours).toMatch(/you can type your own price/i);
  });

  it("never shows the house branch and the plain fallback at once", () => {
    // fallback takes priority when both are somehow set, since "nobody
    // has answered at all" and "the house account answered" cannot both
    // be true of the same path.
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 217.39,
      fallback: true,
      houseTargeted: true,
    });
    expect(p.headline).toMatch(/no model has written a path/i);
  });

  it("says how fast the fallback shape compounds, against the market", () => {
    /*
      "A table written into this app" was true and said nothing about the
      size of the assumption. Some kinds of business were given a shape
      compounding at nearly thirty per cent a year and most were not, and
      which is which is a list somebody here chose. A reader looking at
      one of the fast ones is owed both figures.
    */
    const fast = forecastPathProvenance({
      ticker: "NVDA",
      spot: 180,
      fallback: true,
    });
    const fastStep = (fast.steps ?? []).find((s) => /% a year/.test(s));
    expect(fastStep).toBeTruthy();
    expect(fastStep).toMatch(/for the market as a whole/i);
    // Both numbers present, so the reader can see the gap rather than take it.
    expect(fastStep!.match(/\d+%/g)?.length).toBeGreaterThanOrEqual(2);

    // A company this app does not recognise gets the market's own shape,
    // and the copy says that rather than implying a premium.
    const plain = forecastPathProvenance({
      ticker: "ZZZZQQ",
      spot: 40,
      fallback: true,
    });
    const plainStep = (plain.steps ?? []).find((s) => /% a year/.test(s));
    expect(plainStep).toMatch(/which is what this app uses/i);

    // And the blind spot admits the list is a choice, not a measurement.
    expect(
      plain.blindSpots.some((s) => /not something measured/i.test(s))
    ).toBe(true);
  });

  it("says Pulse fetched headlines when it did, and says so when it did not", () => {
    const withNews = pulseProvenance({
      ticker: "CRWV",
      headlineCount: 2,
    });
    expect(withNews.inputs.some((i) => /2 headlines/i.test(i.detail ?? ""))).toBe(
      true
    );
    expect(withNews.blindSpots.some((s) => /did not get/i.test(s))).toBe(true);

    const without = pulseProvenance({
      ticker: "CRWV",
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

  it("names the reader's own holdings it was only guessing about", () => {
    /*
      This room prints a figure per holding, and behind each is a profile
      saying how that kind of business moves. About ninety companies have
      one written about them; everything else is reasoned from a
      plain-large-company catch-all, which on an ordinary portfolio is
      several of the reader's own names. Assuming that is fair; stating
      the result as fact in silence is not, which is this product's first
      rule.
    */
    const quiet = scenarioProvenance([]).blindSpots.join(" ");
    expect(quiet).not.toMatch(/no profile written/);

    const guessed = scenarioProvenance(["NKE", "DIS"]).blindSpots.join(" ");
    expect(guessed).toMatch(/no profile written for DIS and NKE/);
    expect(guessed).toMatch(/a guess/);

    // One name reads as a sentence too, not "1 holdings".
    const one = scenarioProvenance(["DIS"]).blindSpots.join(" ");
    expect(one).toMatch(/no profile written for DIS, so it is assumed/);
    expect(one).toMatch(/the figure beside it/);

    // Deduped, and a blank never reaches the sentence.
    const messy = scenarioProvenance(["dis", "DIS", " ", "NKE"]).blindSpots.join(" ");
    expect(messy).toMatch(/for DIS and NKE/);
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
      adjust: { missing: false, filled: true, reshaped: true, anchored: false },
    });
    const steps = (p.steps ?? []).join(" ");
    expect(steps).toMatch(/skipped at least one year/i);
    expect(steps).toMatch(/even ramp/i);
  });

  /*
   * The step that matters most, because it is the one where this app, and
   * not the model, chose the number on the card. It was silent for a day
   * in 2026 and that is exactly the failure this panel exists to prevent.
   */
  it("says out loud when the app raised the path to its own assumption", () => {
    const p = forecastPathProvenance({
      ticker: "NBIS",
      spot: 211.11,
      adjust: { missing: false, filled: false, reshaped: false, anchored: true },
    });
    const steps = (p.steps ?? []).join(" ");
    expect(steps).toMatch(/what this app assumes this holding grows at/i);
    expect(steps).toMatch(/raised to meet/i);
    // And that it is a lift rather than a cap, which is the honest half.
    expect(steps).toMatch(/at or above the assumption, it would have been left/i);
  });

  it("names the rate, whose it is and the reason behind it", () => {
    const said = forecastPathProvenance({ ticker: "NBIS", spot: 211.11 })
      .inputs.map((i) => `${i.what} ${i.detail ?? ""}`)
      .join(" ");
    expect(said).toMatch(/what this app assumes it grows at/i);
    expect(said).toMatch(/% a year/);
    expect(said).toMatch(/the reason on file is/i);
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
      adjust: { missing: false, filled: false, reshaped: false, anchored: false },
    });
    const steps = (p.steps ?? []).join(" ");
    expect(steps).not.toMatch(/scaled up|even ramp|skipped|raised to meet/i);
  });

  it("names the publishers behind the headlines a Pulse card read", () => {
    const p = pulseProvenance({
      ticker: "CRWV",
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
   * This assertion has now been written three ways, and the history is the
   * reason to keep it rather than any one wording.
   *
   * While a floor existed, this file made the panel disclose it. When the
   * floor was removed on 2026-08-28 it was inverted: the job became
   * stopping any copy from promising a safety net that was no longer
   * there. The growth assumptions put a lift back on 2026-09-14, so it is
   * inverted again, and the danger is the *old* copy surviving: a panel
   * still telling a reader that nothing in this app moves the model's
   * answer, while the number on the card is this app's, is the single
   * most misleading sentence this product could print. It reads as
   * candour and it is the opposite.
   *
   * What the panel owes a reader is constant through all three: say what
   * sets the number, whoever that is.
   */
  it("never claims the model's answer reaches the reader untouched", () => {
    for (const p of [
      forecastPathProvenance({ ticker: "NBIS", spot: 211.11 }),
      forecastRoomProvenance({}),
    ]) {
      const said = [
        p.headline,
        ...p.inputs.map((i) => `${i.what} ${i.detail ?? ""}`),
        ...(p.steps ?? []),
        ...(p.blindSpots ?? []),
      ].join(" ");
      expect(said).not.toMatch(/nothing in this app moves its answer/i);
      expect(said).not.toMatch(/is shown as it was written/i);
      expect(said).not.toMatch(/floor is ours/i);
    }
  });

  it("names what the growth assumptions rest on, so it can be argued with", () => {
    for (const p of [
      forecastPathProvenance({ ticker: "NBIS", spot: 211.11 }),
      forecastRoomProvenance({}),
    ]) {
      const blind = (p.blindSpots ?? []).join(" ");
      expect(blind).toMatch(/spending behind AI continuing/i);
      // The half that makes it a disclosure rather than a pitch.
      expect(blind).toMatch(/if it slows, these are too high/i);
    }
  });

  it("lists this app as a source, beside the model", () => {
    const names = (forecastPathProvenance({ ticker: "NBIS", spot: 211.11 })
      .sources ?? [])
      .map((s) => s.name)
      .join(" ");
    expect(names).toMatch(/this app/i);
    expect(names).toMatch(/the model itself/i);
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
      // Gemini has left the chain, and its label stays: rows written while
      // it was configured still carry provider "gemini", and the
      // provenance mark owes that reader the name of who ran it.
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

/*
  There is no jsdom here, so the trigger is checked the way the other
  component rules in this repo are: by reading the source for the decision
  that would be expensive to get wrong.
*/
describe("the mark a reader presses", () => {
  const whyThis = readFileSync(
    join(process.cwd(), "src/components/ui/WhyThis.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(process.cwd(), "src/components/ui/Panel.tsx"),
    "utf8"
  );

  it("is the circled i, never an eye", () => {
    /*
      An eye is not the glyph anybody has been taught to press for an
      explanation, so the one control in the app that answers "where did
      this come from" was the one control nobody recognised.
    */
    expect(whyThis).toContain('Info } from "lucide-react"');
    expect(whyThis).toMatch(/<Info\b/);
    expect(whyThis).not.toMatch(/\bEye\b/);
  });

  it("is the same glyph, size and colour as every other tell-me-more", () => {
    // One "tell me more" in the product, not three that look different.
    expect(panel).toMatch(/<Info className="relative h-3\.5 w-3\.5"/);
    expect(whyThis).toMatch(/size-3\.5/);
    for (const source of [whyThis, panel]) {
      expect(source).toContain("text-muted-foreground");
    }
  });

  it("never tells a reader to press an eye", () => {
    // The copy names the control, so it has to name the one that is there.
    const copy = readFileSync(
      join(process.cwd(), "src/lib/provenance.ts"),
      "utf8"
    );
    const strings = copy.match(/"[^"\n]{12,}"/g) ?? [];
    for (const line of strings) {
      expect(line.toLowerCase()).not.toContain(" eye");
    }
  });
});
