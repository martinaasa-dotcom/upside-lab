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
import type { RetirementDetail } from "@/lib/retirement/detail";
import type { RetirementTemplateId } from "@/lib/retirement/templates";

/*
  RENDER THE ROOM AND READ WHAT A NEW ARRIVAL ACTUALLY MEETS.

  The complaint that produced the detail levels was not that any one panel
  was wrong. Every panel here is right, and all of them together were
  unusable: a reader came to find out when they could stop working and met
  seven panels of fields first. The rule that came out of it is one a unit
  test on the arithmetic can never see, so it is checked here by rendering
  the real component: at the default level this room ASKS for the six
  figures nothing can guess and nothing else, and still ANSWERS everything
  it can answer.

  `BelowFold` starts closed, so the panels inside one are deliberately
  absent from this markup. That is the deferral working rather than a
  detail level hiding something, which is why nothing below is asserted
  against the grid or the spending layers.
*/
function roomMarkup(): string {
  return renderToStaticMarkup(
    createElement(RetirementSheet, { portfolioValue: 42_000 })
  );
}

function text(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

const INPUT_PANEL_HEADINGS = [
  "Your home",
  "Children",
  "A car",
  "Income that is not the pot",
  "What the money earns",
];

describe("the retirement room, as somebody new meets it", () => {
  const markup = roomMarkup();
  const body = text(markup);

  it("answers before it asks, which is this room's own oldest rule", () => {
    /*
      Measured at 390 on the first draft: eight template cards and six
      fields put the headline figure 2,103px down, three screens on the
      device most readers arrive on. The panel that answers comes first.
    */
    expect(body.indexOf("Your number")).toBeGreaterThan(-1);
    expect(body.indexOf("Your number")).toBeLessThan(body.indexOf("Start here"));
  });

  it("opens on the templates and the essentials", () => {
    expect(body).toContain("Start here");
    expect(body).toContain("Pick a starting point");
    expect(body).toContain("Just starting out");
    expect(body).toContain("Stop early");
    expect(body).toContain("The figures only you know");
  });

  it("asks for nothing that has a published default", () => {
    for (const heading of INPUT_PANEL_HEADINGS) {
      expect(body, `${heading} must wait for a deeper level`).not.toContain(
        heading
      );
    }
    /* The two dials nobody should have to hold an opinion about cold. */
    expect(body).not.toContain("Medicine improves by");
    expect(body).not.toContain("How the withdrawal rate was built");
  });

  it("keeps the two deep panels behind their fold", () => {
    /*
      Measured at 390 in the app's own CSS: the grid begins at 2,747px and
      the spending layers at 6,010, against a fold at 800, and rendering
      both eagerly took the room from 360 elements to 532. #250 could
      correctly drop these wrappers on its own order, where the grid sat
      second; the card that asks now sits between, so the offset is not the
      same offset. Absent from this markup is the fold working.
    */
    expect(body).not.toContain("What a bad year actually costs you");
    expect(body).not.toContain("What stopping at each age costs");
  });

  it("still answers, which is the whole point of withholding the inputs", () => {
    expect(body).toContain("What you need");
    expect(body).toContain("Your number");
    /* The ladder and the curve cost the reader nothing to read. */
    expect(body).toContain("How long the money has to last");
    expect(body).toContain("One in twenty reach");
  });

  it("says out loud where the rest of it went", () => {
    expect(body).toContain("How much of it you want to see");
    expect(body).toContain("Everything");
    /* The level control says what it adds, so nothing has to be pressed to find out. */
    expect(body).toContain("Nothing else to fill in");
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

  function numberPanel(detail: RetirementDetail): string {
    return text(
      renderToStaticMarkup(
        createElement(NumberPanel, {
          inputs,
          patch: () => {},
          plan,
          provenance,
          detail,
        })
      )
    );
  }

  it("prints both figures even at the simplest level", () => {
    const body = numberPanel("simple");
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
    expect(numberPanel("simple")).not.toContain("Runs out on the last day");
    expect(numberPanel("more")).toContain("Runs out on the last day");
    expect(numberPanel("more")).not.toContain("How the withdrawal rate was built");
    expect(numberPanel("everything")).toContain(
      "How the withdrawal rate was built"
    );
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
    detail: RetirementDetail = "simple",
    inputs = defaultInputs("GB")
  ): string {
    return renderToStaticMarkup(
      createElement(QuickStart, {
        inputs,
        patch: () => {},
        replace: () => {},
        portfolioValue: null,
        detail,
        onDetailChange: () => {},
        templateId,
        onTemplate: () => {},
        result: { target: 697_067, earliestAge: 68 },
      })
    );
  }

  it("is marked with an outline, never a ring", () => {
    const markup = quickStart("family-years");
    const card = markup
      .split("<button")
      .find((chunk) => chunk.includes("Family years"));
    expect(card).toBeTruthy();
    /*
      `ring-*` is a box-shadow utility, and `.glass-well` sets `box-shadow`
      itself from the same cascade layer later in the file, so a ring on a
      well loses and the pressed card looks exactly like the other seven.
      Measured on the rendered card, its whole computed shadow was the
      well's own 1px rim. An outline is a different property and survives.
    */
    expect(card).toContain("outline-primary");
    expect(card).not.toContain("ring-2");
    expect(card).toContain('aria-pressed="true"');
  });

  it("says whose figures are on the page once one is pressed", () => {
    expect(text(quickStart("family-years"))).toContain(
      "worked from the Family years plan"
    );
    expect(text(quickStart(null))).not.toContain("worked from the");
  });
});

/*
  Folding away the CONTROL for a cost is the point of the simple level.
  Folding away the FACT that the cost exists is not: the reader would be
  arguing with a figure whose inputs are nowhere on the page.
*/
describe("nothing in the plan is invisible", () => {
  function quick(detail: RetirementDetail, inputs = defaultInputs("GB")): string {
    return renderToStaticMarkup(
      createElement(QuickStart, {
        inputs,
        patch: () => {},
        replace: () => {},
        portfolioValue: null,
        detail,
        onDetailChange: () => {},
        templateId: null,
        onTemplate: () => {},
        result: { target: 697_067, earliestAge: 68 },
      })
    );
  }

  it("says what else is in the plan when the panels that say it are absent", () => {
    const family = templateInputs(templateById("family-years")!, "GB");
    const body = text(quick("simple", family));
    expect(body).toContain("This plan also counts");
    expect(body).toContain("mortgage");
    expect(body).toContain("2 children");
    expect(body).toContain("car payment");
    expect(body).toContain("Change any of it");
  });

  it("stops saying it once the panels that say it are on the page", () => {
    const family = templateInputs(templateById("family-years")!, "GB");
    /* At `more` the plan inputs render in full, so this would be twice. */
    expect(text(quick("more", family))).not.toContain("This plan also counts");
  });

  it("gives a reader's own spending figure a field rather than a signpost", () => {
    const mine = {
      ...defaultInputs("GB"),
      spendingMode: "custom" as const,
      customAnnualSpend: 27_000,
    };
    const body = text(quick("simple", mine));
    /*
      It used to say "further down", which at this level named nothing: the
      figure was in the headline, uneditable, with the three baskets beside
      it apparently switched off for no visible reason.
    */
    expect(body).not.toContain("further down");
    expect(body).toContain("Your own figure, a year");
  });

  it("leaves the baskets alone when one of them is chosen", () => {
    expect(text(quick("simple"))).not.toContain("Your own figure, a year");
  });
});
