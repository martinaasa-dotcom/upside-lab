import { describe, expect, it } from "vitest";
import {
  fundCopyBullets,
  numberedReportHeadline,
  recapBullets,
  serialFromNewest,
  stripReportSerialPrefix,
} from "@/lib/fund-copy";

describe("a company's order book is not somebody's portfolio", () => {
  /*
    The sheet-to-portfolio rename rewrites `book` everywhere, which is right
    for a sentence about holdings and wrong for the phrase a model writing
    about a business reaches for constantly. Measured on the real room:
    "order book covers most of next year" arrived as "order portfolio covers
    most of next year".
  */
  it("keeps an order book an order book", () => {
    const [first] = fundCopyBullets(
      "Order book covers most of next year already"
    );
    expect(first).toBe("Order book covers most of next year already");
  });

  it("keeps it inside a longer clause and in the plural", () => {
    const bullets = fundCopyBullets(
      "Order books across the industry are still growing; book value is well under the price"
    );
    expect(bullets[0]).toContain("Order books");
    expect(bullets[1]).toContain("Book value");
    expect(bullets.join(" ")).not.toContain("portfolios across");
  });

  it("still rewrites a book that really means a portfolio", () => {
    const [only] = fundCopyBullets("The whole book is down this week");
    expect(only).toMatch(/portfolio/i);
    expect(only).not.toMatch(/\bbook\b/i);
  });

  it("keeps the guard on report headlines too", () => {
    expect(numberedReportHeadline("Order book keeps growing", "Day", 3)).toBe(
      "Day 3: Order book keeps growing"
    );
  });
});

describe("an acronym is not plainer than the words it stands for", () => {
  it("says what the figure is rather than shortening it to three letters", () => {
    const [only] = fundCopyBullets(
      "Remaining performance obligations (RPO) still growing faster than revenue"
    );
    expect(only).toBe(
      "Signed orders not yet billed still growing faster than revenue"
    );
  });

  it("expands a bare mention as well", () => {
    const [only] = fundCopyBullets("RPO is up again");
    expect(only).toMatch(/^Signed orders not yet billed/);
  });
});

describe("a sentence that was cut says it was cut", () => {
  it("marks a clipped bullet", () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const [only] = fundCopyBullets(long);
    expect(only.endsWith(" …")).toBe(true);
    expect(only.split(/\s+/).length).toBe(17);
  });

  it("leaves a short one exactly as it is", () => {
    const [only] = fundCopyBullets("Sells the gear every data centre needs");
    expect(only).toBe("Sells the gear every data centre needs");
  });

  it("marks a clipped recap line the same way", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const [only] = recapBullets(long);
    expect(only.endsWith(" …")).toBe(true);
  });
});

describe("numbering comes from the list, not from the stored text", () => {
  it("strips a serial the model stamped on itself", () => {
    expect(stripReportSerialPrefix("Day one: a quiet day")).toBe("A quiet day");
    expect(stripReportSerialPrefix("Week 3 - bought the cooling name")).toBe(
      "Bought the cooling name"
    );
  });

  it("numbers a newest-first list from the end", () => {
    expect(serialFromNewest(5, 0)).toBe(5);
    expect(serialFromNewest(5, 4)).toBe(1);
    expect(serialFromNewest(0, 0)).toBe(1);
  });
});

describe("empty input", () => {
  it("gives back nothing rather than an empty bullet", () => {
    expect(fundCopyBullets(null)).toEqual([]);
    expect(fundCopyBullets("   ")).toEqual([]);
    expect(recapBullets(undefined)).toEqual([]);
  });
});

describe("a company is a company, not a name", () => {
  it("rewrites the desk usage in both numbers", () => {
    const [plural] = recapBullets("Software names had a good week overall");
    expect(plural).toBe("Software companies had a good week overall");
    const [singular] = recapBullets(
      "Sold the chip maker and bought the cooling name instead"
    );
    expect(singular).toContain("the cooling company");
  });

  it("leaves alone the things that really are names", () => {
    const [only] = recapBullets(
      "The company name on the paperwork was never changed"
    );
    expect(only).toContain("The company name");
  });
});
