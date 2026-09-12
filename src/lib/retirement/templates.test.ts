import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_ID,
  openingPot,
  RETIREMENT_TEMPLATES,
  templateById,
  templateInputs,
} from "@/lib/retirement/templates";
import {
  buildPlan,
  defaultInputs,
  retargetHousehold,
  retargetRetirementAge,
} from "@/lib/retirement/plan";
import { assessLongevity } from "@/lib/retirement/longevity";
import { REGIONS, regionById, statePensionFor } from "@/lib/retirement/regions";
import { sanitizeInputs } from "@/lib/retirement/state";
import { defaultGlide } from "@/lib/retirement/returns";
import {
  atLeast,
  DETAIL_BLURB,
  DETAIL_LABEL,
  RETIREMENT_DETAILS,
  sanitizeDetail,
} from "@/lib/retirement/detail";

/*
  EVERY TEMPLATE HAS TO PRODUCE A PLAN SOMEBODY COULD BE SHOWN.

  A template is one press that fills in forty fields, which is exactly the
  shape of change that can go wrong without anybody noticing: a life that
  quietly sets a retirement age below the reader's current age, or a
  mortgage on a house the same template says is owned outright, still
  renders a page full of confident figures. So every one of them is built
  and run through the real plan here.
*/
function planFor(regionId: string, templateIndex: number) {
  const inputs = templateInputs(RETIREMENT_TEMPLATES[templateIndex], regionId);
  const longevity = assessLongevity({
    currentAge: inputs.currentAge,
    e65Male: regionById(regionId).e65Male,
    e65Female: regionById(regionId).e65Female,
    sex: inputs.sex,
    improvementPct: inputs.improvementPct,
  });
  return { inputs, plan: buildPlan(inputs, longevity.suggestedPlanningAge) };
}

describe("retirement templates", () => {
  it("offers eight lives with no repeated id", () => {
    const ids = RETIREMENT_TEMPLATES.map((t) => t.id);
    expect(ids.length).toBe(8);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds a sane plan for every life, in every country", () => {
    for (const region of REGIONS) {
      for (let i = 0; i < RETIREMENT_TEMPLATES.length; i += 1) {
        const { inputs, plan } = planFor(region.id, i);
        const who = `${RETIREMENT_TEMPLATES[i].id} in ${region.id}`;

        expect(inputs.retirementAge, who).toBeGreaterThan(inputs.currentAge);
        expect(plan.planningAge, who).toBeGreaterThan(inputs.retirementAge);
        expect(Number.isFinite(plan.required.target), who).toBe(true);
        expect(plan.required.target, who).toBeGreaterThan(0);
        expect(Number.isFinite(plan.gap), who).toBe(true);
      }
    }
  });

  it("ports every money figure into the country's own prices", () => {
    const gb = templateInputs(RETIREMENT_TEMPLATES[5], "GB");
    const ee = templateInputs(RETIREMENT_TEMPLATES[5], "EE");
    expect(gb.currentPot).toBeGreaterThan(0);
    expect(ee.currentPot).toBeGreaterThan(0);
    /*
      Estonia is both cheaper and in another currency, so a pot ported
      there cannot be the pound figure typed through unchanged. A template
      that shipped raw pounds into every country would look completely
      right on the one country it was written for.
    */
    expect(ee.currentPot).not.toBe(gb.currentPot);
    expect(ee.annualContribution).not.toBe(gb.annualContribution);
  });

  it("never leaves a mortgage on a home it says is owned outright", () => {
    for (const template of RETIREMENT_TEMPLATES) {
      const inputs = templateInputs(template, "GB");
      if (inputs.housing !== "mortgage") continue;
      expect(inputs.mortgageYearsLeft).toBeGreaterThan(0);
      expect(inputs.mortgageAnnual).toBeGreaterThan(0);
    }
  });

  it("moves the glide with a life that stops early", () => {
    const early = RETIREMENT_TEMPLATES.find((t) => t.id === "stop-early");
    expect(early).toBeTruthy();
    const inputs = templateInputs(early!, "GB");
    /*
      The mix of shares and bonds is a function of the age somebody stops.
      Left at the default for a state pension age, "Stop early" would hold
      eighty per cent in shares for fifteen years after the reader had
      stopped earning.
    */
    expect(inputs.glide).toEqual(defaultGlide(inputs.retirementAge));
    expect(inputs.glide[inputs.glide.length - 1].fromAge).toBe(50);
  });

  it("leaves the market assumptions identical across every life", () => {
    const base = defaultInputs("GB");
    for (const template of RETIREMENT_TEMPLATES) {
      const inputs = templateInputs(template, "GB");
      expect(inputs.returns).toEqual(base.returns);
      expect(inputs.swrOverridePct).toBe(base.swrOverridePct);
      expect(inputs.globalHaircut).toBe(base.globalHaircut);
    }
  });

  it("survives a round trip through the stored plan", () => {
    for (const template of RETIREMENT_TEMPLATES) {
      const inputs = templateInputs(template, "DE");
      const back = sanitizeInputs(JSON.parse(JSON.stringify(inputs)));
      expect(back.currentAge).toBe(inputs.currentAge);
      expect(back.retirementAge).toBe(inputs.retirementAge);
      expect(back.currentPot).toBe(inputs.currentPot);
      expect(back.children.length).toBe(inputs.children.length);
    }
  });

  it("answers with null for a template id nobody has", () => {
    expect(templateById("not-a-life")).toBeNull();
    expect(templateById(null)).toBeNull();
    expect(templateById("stop-early")?.label).toBe("Stop early");
  });
});

describe("moving the age somebody stops", () => {
  it("carries an untouched glide with it", () => {
    const inputs = defaultInputs("GB");
    const moved = retargetRetirementAge(inputs, 55);
    expect(moved.retirementAge).toBe(55);
    expect(moved.glide).toEqual(defaultGlide(55));
  });

  it("leaves a glide the reader built alone", () => {
    const inputs = defaultInputs("GB");
    const mine = [{ fromAge: 0, equityPct: 40 }];
    const moved = retargetRetirementAge({ ...inputs, glide: mine }, 55);
    expect(moved.retirementAge).toBe(55);
    expect(moved.glide).toEqual(mine);
  });
});

describe("the detail level", () => {
  it("is simple for anything it does not recognise", () => {
    expect(sanitizeDetail(null)).toBe("simple");
    expect(sanitizeDetail("advanced")).toBe("simple");
    expect(sanitizeDetail("everything")).toBe("everything");
  });

  it("ranks, so a panel can ask for a floor rather than a match", () => {
    expect(atLeast("simple", "simple")).toBe(true);
    expect(atLeast("simple", "more")).toBe(false);
    expect(atLeast("everything", "more")).toBe(true);
    expect(atLeast("more", "everything")).toBe(false);
  });

  it("says what each level adds, in its own words", () => {
    for (const id of RETIREMENT_DETAILS) {
      expect(DETAIL_LABEL[id].length).toBeGreaterThan(0);
      expect(DETAIL_BLURB[id].length).toBeGreaterThan(20);
    }
  });
});

describe("one person or two", () => {
  it("collects two state pensions for a couple", () => {
    const region = regionById("GB");
    const single = defaultInputs("GB");
    expect(single.statePensionAnnual).toBe(region.statePensionAnnual);

    const couple = retargetHousehold(single, "couple");
    /*
      The published rate is per person and the spending baskets are per
      household, so a couple read against one pension is short by a whole
      pension. At a three per cent rate that is roughly four hundred
      thousand pounds of pot they do not need.
    */
    expect(couple.statePensionAnnual).toBe(region.statePensionAnnual * 2);
    expect(couple.customAnnualSpend).toBeGreaterThan(single.customAnnualSpend);
  });

  it("leaves a pension the reader typed alone", () => {
    const mine = { ...defaultInputs("GB"), statePensionAnnual: 8_400 };
    expect(retargetHousehold(mine, "couple").statePensionAnnual).toBe(8_400);
  });

  it("leaves a spending figure the reader typed alone", () => {
    const mine = {
      ...defaultInputs("GB"),
      spendingMode: "custom" as const,
      customAnnualSpend: 27_000,
    };
    expect(retargetHousehold(mine, "couple").customAnnualSpend).toBe(27_000);
  });

  it("gives every couple template two of them", () => {
    const region = regionById("GB");
    for (const template of RETIREMENT_TEMPLATES) {
      const inputs = templateInputs(template, "GB");
      expect(inputs.statePensionAnnual).toBe(
        statePensionFor(region, template.household)
      );
    }
  });
});

describe("the life the room opens on", () => {
  it("is a real one, and it lands somewhere near its own target", () => {
    const opener = templateById(DEFAULT_TEMPLATE_ID);
    expect(opener).toBeTruthy();
    const { plan, inputs } = planFor("GB", RETIREMENT_TEMPLATES.indexOf(opener!));
    /*
      The point of opening on a life rather than on zeroes is that the page
      shows what it DOES. A first paint whose gap is the entire target, or
      one already so far ahead that nothing is left to work towards, shows
      nothing. Within a third of the target either way is a real answer.
    */
    expect(Math.abs(plan.gap)).toBeLessThan(plan.required.target / 3);
    expect(inputs.currentPot).toBeGreaterThan(0);
    expect(inputs.annualContribution).toBeGreaterThan(0);
  });
});

/*
  THE ONE PLACE TWO GOOD FEATURES DISAGREED.

  Opening the room on a life and starting the pot on what the reader
  actually holds both landed in the same hour and both were right. They
  merged cleanly and cancelled: the pre-fill only ever wrote into an
  untouched zero, the opening template's pot is not zero, so a brand new
  reader with real holdings was shown a made-up figure and the better of
  the two features was dead for exactly the person it was written for.
*/
describe("the pot a first visit opens on", () => {
  it("prefers what the reader actually holds over the template's guess", () => {
    const opener = templateById(DEFAULT_TEMPLATE_ID)!;
    const guess = templateInputs(opener, "GB").currentPot;
    expect(guess).toBeGreaterThan(0);
    expect(openingPot(guess, 42_000)).toBe(42_000);
  });

  it("keeps the template's figure when there is nothing to hold", () => {
    /*
      The alternative is the zeroes this opener exists to avoid: a pot of
      nothing, a gap equal to the whole target and an earliest age of n/a,
      handed to somebody three seconds after they arrived.
    */
    expect(openingPot(25_000, null)).toBe(25_000);
    expect(openingPot(25_000, 0)).toBe(25_000);
    expect(openingPot(25_000, -5)).toBe(25_000);
  });

  it("rounds, because a pot is money and not a fraction of a penny", () => {
    expect(openingPot(25_000, 42_000.4)).toBe(42_000);
  });

  it("builds every life on its own pot, which the room overrides on a press", () => {
    /*
      `templateInputs` is pure and stays that way: it is the ARITHMETIC of
      a life, tuned to the pot it names, and it never reasons about what
      the reader holds. Whether that pot reaches the screen unchanged, an
      account with nothing real, or is overridden by a real portfolio, on
      every other account, is `RetirementSheet`'s `applyTemplate` calling
      `openingPot` / `resolvedPotOverride` on top of this, in `pot-source.ts`
      and its own tests. This file only pins the function under it.
    */
    for (const template of RETIREMENT_TEMPLATES) {
      const built = templateInputs(template, "GB");
      expect(built.currentPot).toBe(
        localisedPotFor(template.potGbp)
      );
    }
  });
});

/** The template's own figure in the region's money, with nothing applied. */
function localisedPotFor(gbp: number): number {
  return templateInputs(
    { ...RETIREMENT_TEMPLATES[0], potGbp: gbp },
    "GB"
  ).currentPot;
}
