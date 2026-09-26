import { describe, expect, it } from "vitest";
import { onFriday } from "@/lib/community-fun-facts";

/*
  At the weekend every day figure in a circle is Friday's close, and the
  facts said "today" over them on a Saturday.
*/
describe("at the weekend the facts are about Friday", () => {
  it("rewrites the day's facts in the past tense about Friday", () => {
    expect(onFriday("Every portfolio in the circle is up today.")).toBe(
      "Every portfolio in the circle was up on Friday."
    );
    expect(onFriday("All 4 portfolios here are down today.")).toBe(
      "All 4 portfolios here were down on Friday."
    );
    expect(onFriday("Anna is having the best day here, up 1.2%.")).toBe(
      "Anna had the best day here, up 1.2%."
    );
    expect(
      onFriday("The best and the hardest day in the circle are 2.1% apart today.")
    ).toBe("The best and the hardest day in the circle were 2.1% apart on Friday.");
    expect(onFriday("Anna and Priya both own Nvidia.")).toBe(
      "Anna and Priya both own Nvidia."
    );
  });
});
