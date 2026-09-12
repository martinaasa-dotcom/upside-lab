import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readings = readFileSync(
  join(process.cwd(), "src/lib/company/readings.ts"),
  "utf8"
);
const fairValue = readFileSync(
  join(process.cwd(), "src/lib/company/fair-value.ts"),
  "utf8"
);
const glance = readFileSync(
  join(process.cwd(), "src/components/company/ValueGlance.tsx"),
  "utf8"
);

/*
  ONE PAGE QUOTES TWO EXPECTATIONS OF THE S&P 500, AND THEY DIFFER.

  `CompanyFacts` carries both `marketEpsGrowthNextYear` (the feed's "+1y")
  and `marketLongTermGrowth` (its "LTG"), and the company room reads the
  pair in opposite precedence in two places, on purpose:

    readings.ts   nextYear ?? longTerm   beside this company's next-year growth
    fair-value.ts longTerm ?? nextYear   beside a five-year compounding bet

  Each is the like-for-like comparison where it sits. What was wrong is that
  neither sentence said which horizon it meant, so on Apple the page read
  "12% a year expected of the S&P 500" in one place and "the S&P 500 is
  expected to manage 15.4%" in another, and a reader can only conclude that
  one of them is wrong.

  The precedences must stay opposite, and each sentence must keep naming its
  horizon. Either half going quietly puts the contradiction back.
*/
describe("the two market-growth figures each say which horizon they mean", () => {
  it("keeps the two precedences opposite, which is why they differ", () => {
    expect(
      readings,
      "readings.ts should compare next year against next year"
    ).toMatch(/marketEpsGrowthNextYear\s*\?\?\s*f?\.?marketLongTermGrowth/);
    expect(
      fairValue,
      "fair-value.ts should compare a five-year bet against the long-run rate"
    ).toMatch(/marketLongTermGrowth\s*\?\?\s*f?\.?marketEpsGrowthNextYear/);
  });

  it("names the horizon in the next-year sentence", () => {
    const line = readings.match(
      /`This is what the price is a bet on[^`]*`/
    )?.[0];
    expect(line, "the next-year comparison sentence moved").toBeTruthy();
    expect(
      line,
      "say which horizon, or this reads as disagreeing with the valuation panel"
    ).toMatch(/next year/);
  });

  it("names the horizon in the long-run sentence", () => {
    const line = glance.match(/`, against[^`]*S&P 500[^`]*`/)?.[0];
    expect(line, "the long-run comparison sentence moved").toBeTruthy();
    expect(
      line,
      "say which horizon, or this reads as disagreeing with Key financials"
    ).toMatch(/long run/);
  });
});
