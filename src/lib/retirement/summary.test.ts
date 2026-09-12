import { describe, expect, it } from "vitest";
import { planExtras, planExtrasSentence } from "@/lib/retirement/summary";
import { defaultInputs } from "@/lib/retirement/plan";
import { templateById, templateInputs } from "@/lib/retirement/templates";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/*
  THE ONE THING THE DETAIL LEVELS COULD QUIETLY BREAK.

  Folding away the CONTROL for a cost is the whole point of the simple
  level. Folding away the FACT that the cost exists is this repository's
  oldest rule broken: the reader is then arguing with a figure whose inputs
  they cannot see. Every cost and every income in the plan that is not one
  of the eight figures on the first card has to reach this sentence.
*/
describe("what else is in the plan", () => {
  it("names a mortgage with its end, and rent as never ending", () => {
    const base = defaultInputs("GB");
    const mortgage = planExtras(
      { ...base, housing: "mortgage", mortgageAnnual: 12_000, mortgageYearsLeft: 11 },
      money
    );
    expect(mortgage.join(" ")).toContain("11 years left");

    const renting = planExtras(
      { ...base, housing: "renting", rentAnnual: 13_200 },
      money
    );
    /*
      Rent never ending is the whole reason it is asked apart from a
      mortgage, and it is the largest line a renting reader carries.
    */
    expect(renting.join(" ")).toContain("never ends");
  });

  it("counts children, and says how old they stop being expensive", () => {
    /*
      Housing and the car are held off here on purpose, matching the same
      isolation `retirement.test.ts` already applies elsewhere: a fresh
      plan now defaults to a mortgage and a car payment (#252), so leaving
      either on would put a housing or car line ahead of the child line
      this test is actually checking, which is a different assertion than
      the one being made.
    */
    const base = { ...defaultInputs("GB"), housing: "owned" as const, carMonthly: 0 };
    const one = planExtras(
      { ...base, children: [{ id: "a", age: 4 }], childAnnualCost: 9_200 },
      money
    );
    expect(one[0]).toContain("one child");
    expect(one[0]).toContain("until they are 18");

    const two = planExtras(
      {
        ...base,
        children: [
          { id: "a", age: 8 },
          { id: "b", age: 5 },
        ],
        childAnnualCost: 9_200,
      },
      money
    );
    expect(two[0]).toContain("2 children");
  });

  it("tells a car that ends from one that does not", () => {
    // Housing held off for the same reason as the test above: a default
    // mortgage would otherwise be extras[0], ahead of the car line here.
    const base = { ...defaultInputs("GB"), housing: "owned" as const };
    const ending = planExtras({ ...base, carMonthly: 300, carYearsLeft: 3 }, money);
    expect(ending[0]).toContain("3 more years");
    const forever = planExtras({ ...base, carMonthly: 300, carForever: true }, money);
    expect(forever[0]).toContain("never ends");
  });

  it("names the state pension, which is the most under-counted figure here", () => {
    const base = defaultInputs("GB");
    expect(planExtras(base, money).join(" ")).toContain("state pension");
    expect(
      planExtras({ ...base, includeStatePension: false }, money).join(" ")
    ).not.toContain("state pension");
  });

  it("says nothing at all rather than saying there is nothing", () => {
    const bare = {
      ...defaultInputs("GB"),
      includeStatePension: false,
      housing: "owned" as const,
      carMonthly: 0,
      otherSavings: 0,
      otherIncomeAnnual: 0,
      withdrawalTaxPct: 0,
      children: [],
    };
    expect(planExtras(bare, money)).toEqual([]);
    expect(planExtrasSentence(bare, money)).toBeNull();
  });

  it("reads as English with one item and with several", () => {
    /*
      Housing and the car are held off here too: a fresh plan's own
      defaults now carry a mortgage and a car payment (#252), so the
      "one item" case needs those switched off to actually have one item
      (the state pension) rather than three.
    */
    const base = { ...defaultInputs("GB"), housing: "owned" as const, carMonthly: 0 };
    const one = planExtrasSentence(base, money);
    expect(one).toMatch(/^This plan also counts /);
    expect(one).not.toContain(" and ");

    const many = planExtrasSentence(
      {
        ...base,
        housing: "mortgage",
        mortgageAnnual: 12_000,
        mortgageYearsLeft: 11,
        children: [{ id: "a", age: 8 }],
        childAnnualCost: 9_200,
        carMonthly: 300,
      },
      money
    );
    expect(many).toContain(" and ");
    /* One list, one separator: no dash, and no stranded comma before "and". */
    expect(many).not.toMatch(/,\s+and\b/);
  });

  it("surfaces everything the family template quietly filled in", () => {
    const family = templateById("family-years");
    const said = planExtrasSentence(
      templateInputs(family!, "GB"),
      money
    );
    /*
      The template presses in a mortgage, two children and a car in one
      press. A reader who cannot see any of that on the simple level is
      reading a pot with three invisible costs inside it.
    */
    expect(said).toContain("mortgage");
    expect(said).toContain("2 children");
    expect(said).toContain("car payment");
    expect(said).toContain("state pension");
  });

  it("states every recurring figure as a month, matching how it was typed", () => {
    /*
      Every field this sentence restates (mortgage, rent, a child's cost,
      the state pension, other guaranteed income) is now typed and shown
      as a month's figure on the page above it (`MonthlyMoneyField`). This
      sentence used to divide none of them and still say "a year", so a
      reader who had just typed a mortgage as a monthly amount read it
      straight back here at twelve times the size, under the same word.
    */
    const family = templateById("family-years");
    const said = planExtrasSentence(templateInputs(family!, "GB"), money)!;
    expect(said).not.toContain("a year");
    expect(said).toContain("a month");

    const mortgage = planExtras(
      { ...defaultInputs("GB"), housing: "mortgage", mortgageAnnual: 12_000, mortgageYearsLeft: 11 },
      money
    ).join(" ");
    expect(mortgage).toContain(`${money(1_000)} a month`);

    const renting = planExtras(
      { ...defaultInputs("GB"), housing: "renting", rentAnnual: 13_200 },
      money
    ).join(" ");
    expect(renting).toContain(`${money(1_100)} a month`);
  });
});
