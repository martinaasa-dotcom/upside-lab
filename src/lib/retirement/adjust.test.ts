import { describe, expect, it } from "vitest";
import {
  ADJUST_TOPICS,
  sanitizeOpenTopics,
  toggleTopic,
  topicSummary,
} from "@/lib/retirement/adjust";
import { defaultInputs } from "@/lib/retirement/plan";
import { templateById, templateInputs } from "@/lib/retirement/templates";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const extra = { planningAge: 99, swrPct: 3.5 };

describe("the topics a reader can open", () => {
  it("keeps the chips' own order whatever order they were ticked in", () => {
    expect(toggleTopic(toggleTopic([], "returns"), "home")).toEqual(["home", "returns"]);
  });

  it("closes a topic that is open", () => {
    expect(toggleTopic(["home", "car"], "home")).toEqual(["car"]);
  });

  it("forgets anything it does not recognise in storage", () => {
    expect(sanitizeOpenTopics(["car", "nonsense", 3, "car"])).toEqual(["car"]);
    expect(sanitizeOpenTopics("home")).toEqual([]);
  });
});

describe("what each chip says", () => {
  const family = templateInputs(templateById("family-years")!, "GB");

  it("states a figure for every topic, never a blank", () => {
    for (const topic of ADJUST_TOPICS) {
      const said = topicSummary(topic, family, money, extra);
      expect(said.trim().length, topic).toBeGreaterThan(0);
      expect(said).not.toMatch(/[–—]/);
    }
  });

  it("says None out loud rather than leaving a chip empty", () => {
    const bare = { ...defaultInputs("GB"), children: [], carMonthly: 0 };
    expect(topicSummary("children", bare, money, extra)).toBe("None");
    expect(topicSummary("car", bare, money, extra)).toBe("None");
  });

  it("names rent by the month", () => {
    const renting = { ...defaultInputs("GB"), housing: "renting" as const, rentAnnual: 12_000 };
    expect(topicSummary("home", renting, money, extra)).toBe("Rent £1,000 a month");
  });

  it("counts the years before a pension only when there are some", () => {
    const early = { ...defaultInputs("GB"), retirementAge: 60, statePensionAge: 67, includeStatePension: true };
    expect(topicSummary("bridge", early, money, extra)).toBe("7 years before your pension");
    const late = { ...early, retirementAge: 67 };
    expect(topicSummary("bridge", late, money, extra)).toBe("For a stretch with an end date");
  });
});
