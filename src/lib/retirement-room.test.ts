import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuickStart } from "@/components/retirement/QuickStart";
import { RetirementSheet } from "@/components/retirement/RetirementSheet";
import { LongevityPanel } from "@/components/retirement/LongevityPanel";
import { NumberPanel } from "@/components/retirement/NumberPanel";
import { assessLongevity } from "@/lib/retirement/longevity";
import { buildPlan, defaultInputs, planningAgeFor } from "@/lib/retirement/plan";
import { templateById, templateInputs } from "@/lib/retirement/templates";
import { regionById, UK_STANDARDS_SOURCE } from "@/lib/retirement/regions";
import { RETURNS_SOURCE } from "@/lib/retirement/returns";
import { GLOBAL_HAIRCUT_SOURCE, SWR_SOURCE } from "@/lib/retirement/swr";
import { retirementProvenance } from "@/lib/provenance";
import type { AdjustTopic } from "@/lib/retirement/adjust";
import type { RetirementTemplateId } from "@/lib/retirement/templates";

/*
  RENDER THE ROOM AND READ WHAT A NEW ARRIVAL ACTUALLY MEETS.

  The complaint that produced the topic chips was not that any one panel
  was wrong. Every panel here is right, and all of them together were
  unusable: a reader came to find out when they could stop working and met
  seven panels of fields first. The rule that came out of it is one a unit
  test on the arithmetic can never see, so it is checked here by rendering
  the real component: with nothing ticked this room ASKS for the six
  figures nothing can guess and nothing else, and still ANSWERS everything
  it can answer.

  `BelowFold` starts closed, so the panels inside one are deliberately
  absent from this markup. That is the deferral working rather than a
  topic being hidden, which is why nothing below is asserted
  against the spending layers, the one panel here still behind a fold.
  The grid is not: it carries the results table's anchor id, so it must
  render eagerly and is asserted present rather than absent.
*/
function roomMarkup(): string {
  return renderToStaticMarkup(
    createElement(RetirementSheet, { portfolioValue: 42_000 })
  );
}

function text(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

/*
  A line only the editor itself carries, never its chip: the chips are named
  after the same topics ("Children", "Car"), so a heading would be found on
  the chip and prove nothing about whether the editor opened.
*/
const INPUT_PANEL_HEADINGS = [
  "The published baskets assume a home owned outright",
  "Each child drops off the plan",
  "A lease or finance payment",
  "Guaranteed income the pot does not have to fund",
  "Real returns, after inflation",
];

describe("the retirement room, as somebody new meets it", () => {
  const markup = roomMarkup();
  const body = text(markup);

  it("asks as a sentence and answers in the same card", () => {
    /*
      The form is gone: the figures only the reader knows are words in one
      sentence, each tappable, and the verdict sits straight under it.
    */
    expect(body).toContain("When could you stop working?");
    expect(body).toContain("I am");
    expect(body).toContain("would like to stop working at");
    expect(body).toContain("a month");
    expect(body).toContain("My money grows like");
    expect(body.indexOf("My money grows like")).toBeLessThan(
      body.indexOf("Drag to try another age")
    );
    expect(body).not.toContain("The figures only you know");
  });

  it("keeps the example lives one press away rather than a row of cards", () => {
    expect(body).toContain("example life");
    expect(body).not.toContain("Just starting out");
  });

  it("asks for nothing that has a published default", () => {
    for (const heading of INPUT_PANEL_HEADINGS) {
      expect(body, `${heading} must wait until its chip is ticked`).not.toContain(
        heading
      );
    }
    /* The two dials nobody should have to hold an opinion about cold. */
    expect(body).not.toContain("Medicine improves by");
    expect(body).not.toContain("How the withdrawal rate was built");
  });

  it("still keeps the illustrative slider behind its fold", () => {
    /*
      `FlexiblePanel` is a local, illustrative slider over the plan rather
      than a plan input, and it is reliably the furthest thing down the
      page, so it stays behind `BelowFold`. Absent from this markup is the
      fold working.
    */
    expect(body).not.toContain("What a bad year actually costs you");
  });

  it("folds the working behind one press", () => {
    expect(body).toContain("Show the working");
    expect(body).not.toContain("What stopping at each age costs");
    expect(body).not.toContain("One in ten reach");
  });

  it("names how long it lasts in the sentence itself", () => {
    expect(body).toContain("it has to last until");
  });

  it("says out loud where the rest of it went, and what it currently is", () => {
    expect(body).toContain("What else the plan counts");
    expect(body).toContain("Tick anything to change it");
    for (const label of ["Home", "Children", "Car", "Pensions and income", "Returns and mix"]) {
      expect(body).toContain(label);
    }
    /* The levels are gone for good: one change never opens everything. */
    expect(body).not.toContain("How much of it you want to see");
    expect(body).not.toContain("Everything");
  });
});

/*
  The honesty line the levels may not cross. The headline is the safe-rate
  figure, which is the larger of the two, and a page that printed it with
  no mention of the other would be choosing an arithmetic and hiding that
  it had chosen. Folding away the WORKING is allowed; folding away a figure
  the headline was picked over is not.
*/
describe("both pots are named at every level", () => {
  const inputs = defaultInputs("GB");
  const region = regionById(inputs.regionId);
  const longevity = assessLongevity({
    currentAge: inputs.currentAge,
    e65Male: region.e65Male,
    e65Female: region.e65Female,
    sex: inputs.sex,
    improvementPct: inputs.improvementPct,
  });
  const plan = buildPlan(inputs, longevity.suggestedPlanningAge);
  const provenance = retirementProvenance({
    regionName: region.name,
    standardsSource: UK_STANDARDS_SOURCE,
    returnsSource: RETURNS_SOURCE,
    swrSource: SWR_SOURCE,
    haircutSource: GLOBAL_HAIRCUT_SOURCE,
    statePensionSource: region.statePensionSource,
    e65: region.e65Female,
    planningAge: planningAgeFor(inputs, longevity.suggestedPlanningAge),
    improvementPct: inputs.improvementPct,
    currentAge: inputs.currentAge,
    swrPct: plan.required.swr.ratePct,
    realReturnPct: plan.realReturnPct,
    basis: plan.required.basis,
  });

  function numberPanel(showWorking: boolean): string {
    return text(
      renderToStaticMarkup(
        createElement(NumberPanel, {
          inputs,
          patch: () => {},
          plan,
          provenance,
          showWorking,
          curve: [],
          earliestAge: null,
          onRetirementAge: () => {},
        })
      )
    );
  }

  it("prints both figures even at the simplest level", () => {
    const body = numberPanel(false);
    const money = (n: number) =>
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
      })
        .format(n)
        .replace(/ /g, " ");
    expect(body).toContain(money(plan.required.target));
    expect(body).toContain(money(plan.required.spendDown));
  });

  it("only shows the working once it has been asked for", () => {
    expect(numberPanel(false)).not.toContain("Runs out on the last day");
    expect(numberPanel(false)).not.toContain("How the withdrawal rate was built");
    expect(numberPanel(true)).toContain("Runs out on the last day");
    expect(numberPanel(true)).toContain("How the withdrawal rate was built");
  });
});

describe("the survival curve", () => {
  const inputs = defaultInputs("GB");
  const region = regionById(inputs.regionId);
  const result = assessLongevity({
    currentAge: inputs.currentAge,
    e65Male: region.e65Male,
    e65Female: region.e65Female,
    sex: inputs.sex,
    improvementPct: inputs.improvementPct,
  });

  function panel(showControls: boolean): string {
    return text(
      renderToStaticMarkup(
        createElement(LongevityPanel, {
          inputs,
          patch: () => {},
          result,
          planningAge: result.suggestedPlanningAge,
          showControls,
        })
      )
    );
  }

  it("draws the lesson whether or not the controls are on", () => {
    for (const show of [true, false]) {
      expect(panel(show)).toContain("One in ten reach");
      expect(panel(show)).toContain("How this is worked out");
    }
  });

  it("holds its two controls back until they are asked for", () => {
    expect(panel(false)).not.toContain("Medicine improves by");
    expect(panel(false)).not.toContain("Plan runs to age");
    expect(panel(true)).toContain("Medicine improves by");
    expect(panel(true)).toContain("Plan runs to age");
  });
});

describe("the card a reader pressed", () => {
  function quickStart(
    templateId: RetirementTemplateId | null,
    inputs = defaultInputs("GB")
  ): string {
    return renderToStaticMarkup(
      createElement(QuickStart, {
        inputs,
        defaultShowLives: true,
        open: [],
        onToggle: () => {},
        planningAge: 99,
        swrPct: 3.5,
        templateId,
        onTemplate: () => {},
      })
    );
  }

  it("is marked with a border, never a ring or an outline", () => {
    const markup = quickStart("family-years");
    const card = markup
      .split("<button")
      .find((chunk) => chunk.includes("Family years") && chunk.includes("aria-pressed"));
    expect(card).toBeTruthy();
    /*
      `ring-*` is a box-shadow utility, and `.glass-well` sets `box-shadow`
      itself from the same cascade layer later in the file, so a ring on a
      well loses and the pressed card looks exactly like the other seven.
      An `outline` survives that, but it is not clipped to the card's own
      border-radius the way a `border` is, so at a negative offset on a
      rounded corner the two curves disagree and the mismatch reads as a
      bulge past the card's edge on hover. A border is part of the box
      itself, so it is always the same radius as the card.
    */
    expect(card).toContain("border-primary");
    expect(card).not.toContain("ring-2");
    expect(card).not.toContain("outline-primary");
    expect(card).not.toContain("outline-border");
    expect(card).toContain('aria-pressed="true"');
  });

  it("catches the light on hover like every other pressable card", () => {
    const markup = quickStart(null);
    const card = markup
      .split("<button")
      .find((chunk) => chunk.includes("Family years") && chunk.includes("aria-pressed"));
    expect(card).toBeTruthy();
    /*
      `veil-hover` matches `StandardPicker` (`PlanInputs.tsx`), the sibling
      card picker one panel down. Without it the border was the only hover
      feedback, where every other pressable card in the app also lightens
      across its whole face.
    */
    expect(card).toContain("veil-hover");
  });

  it("says whose figures are on the page once one is pressed", () => {
    expect(text(quickStart("family-years"))).toContain(
      "Every figure starts from this life"
    );
    expect(text(quickStart(null))).not.toContain("starts from this life");
  });
});

/*
  Folding away the CONTROL for a cost is the point of the chips. Folding
  away the FACT that the cost exists is not: the reader would be arguing
  with a figure whose inputs are nowhere on the page. So every chip says
  what the plan assumes for it, ticked or not.
*/
describe("nothing in the plan is invisible", () => {
  function quick(open: AdjustTopic[] = [], inputs = defaultInputs("GB")): string {
    return renderToStaticMarkup(
      createElement(QuickStart, {
        inputs,
        open,
        onToggle: () => {},
        planningAge: 99,
        swrPct: 3.5,
        templateId: null,
        onTemplate: () => {},
      })
    );
  }

  it("names every cost on its chip without opening anything", () => {
    const family = templateInputs(templateById("family-years")!, "GB");
    const body = text(quick([], family));
    expect(body).toContain("Mortgage");
    expect(body).toContain("2, ");
    expect(body).toContain("a month each");
    expect(body).toMatch(/Car [^ ]+ a month/);
    expect(body).toContain("Planned to age 99");
  });

  it("opens exactly the editors that were ticked, and no others", () => {
    const body = text(
      renderToStaticMarkup(
        createElement(RetirementSheet, { portfolioValue: 42_000 })
      )
    );
    expect(body).not.toContain("Each child drops off the plan");
  });

  it("marks a ticked chip as pressed", () => {
    const markup = quick(["home"]);
    const chip = markup.split("<button").find((c) => c.includes(">Home<"));
    expect(chip).toContain('aria-pressed="true"');
    const car = markup.split("<button").find((c) => c.includes(">Car<"));
    expect(car).toContain('aria-pressed="false"');
  });
});

describe("the verdict", () => {
  it("says yes or not yet, and offers presses rather than instructions", async () => {
    const { buildVerdict } = await import("@/lib/retirement/verdict");
    const money = (n: number) => `$${Math.round(n)}`;
    const short = buildVerdict({
      retirementAge: 60,
      have: 300_000,
      need: 600_000,
      earliestAge: 66,
      monthlyToClose: 842,
      money,
    });
    expect(short.headline).toBe("Not yet at 60.");
    expect(short.detail).toContain("50% of the way");
    expect(short.fixes.map((f) => f.text)).toEqual([
      "Stopping at 66 is enough.",
      "Adding $850 a month is enough.",
    ]);
    const ready = buildVerdict({
      retirementAge: 65,
      have: 700_000,
      need: 600_000,
      earliestAge: 62,
      monthlyToClose: 0,
      money,
    });
    expect(ready.headline).toBe("Yes. You could stop at 65.");
    expect(ready.fixes).toEqual([]);
    expect(ready.sooner).toContain("62");
    for (const v of [short, ready]) {
      const all = [v.headline, v.detail, v.sooner ?? "", ...v.fixes.map((f) => f.text)].join(" ");
      expect(all).not.toMatch(/\byou should\b|\bmust\b|\bbuy\b|\bsell\b|[\u2013\u2014]/i);
    }
  });
});
