import { describe, expect, it } from "vitest";
import { sanitizeFundWatchlist } from "@/lib/fund-watchlist";

describe("the public list of what the fund is waiting for", () => {
  it("drops anything it already owns, so the list stays honest", () => {
    const out = sanitizeFundWatchlist(
      [
        { ticker: "NVDA", waitFor: "A pullback" },
        { ticker: "AMD", waitFor: "A fall under $150" },
      ],
      ["nvda"]
    );
    expect(out.map((w) => w.ticker)).toEqual(["AMD"]);
  });

  it("drops a row with no reason, a junk symbol and a repeat", () => {
    const out = sanitizeFundWatchlist(
      [
        { ticker: "AMD", waitFor: "   " },
        { ticker: "123", waitFor: "Anything" },
        { ticker: "$anet", waitFor: "A quiet week" },
        { ticker: "ANET", waitFor: "Something else" },
        null,
        "nonsense",
      ],
      []
    );
    expect(out).toEqual([{ ticker: "ANET", waitFor: "A quiet week" }]);
  });

  it("never lists more than four", () => {
    const many = ["A", "B", "C", "D", "E", "F"].map((t) => ({
      ticker: `${t}${t}`,
      waitFor: "A better price",
    }));
    expect(sanitizeFundWatchlist(many, [])).toHaveLength(4);
  });

  it("scrubs the sentence the model wrote before a reader sees it", () => {
    /*
      This one string is printed straight under a company's name, and it used
      to be the only piece of the fund's prose that reached the page without
      the pass everything else goes through. An em dash is the loudest tell
      that a sentence was generated.
    */
    const [only] = sanitizeFundWatchlist(
      [{ ticker: "AMD", waitFor: "A fall under $150 — after next results" }],
      []
    );
    expect(only!.waitFor).not.toMatch(/[–—]/);
  });
});
