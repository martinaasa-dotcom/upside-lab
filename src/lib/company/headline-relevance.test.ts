import { describe, expect, it } from "vitest";
import { companyArticles, companyNameWords, headlineIsAbout } from "@/lib/company/sources";

/*
  Measured on the Nvidia page: the feed's related stories included a
  weight-loss drug and a meme coin, listed under "articles this page was
  written from". A headline counts only when it names the company.
*/
describe("a company page lists only headlines about the company", () => {
  const words = companyNameWords("NVDA", "NVIDIA Corporation");

  it("names the ticker and the company's own first word", () => {
    expect(words).toEqual(["NVDA", "NVIDIA"]);
    expect(companyNameWords("KO", "The Coca-Cola Company")).toEqual(["KO", "Coca-Cola"]);
    expect(companyNameWords("DIS", "The Walt Disney Company")).toEqual(["DIS", "Walt", "Disney"]);
    expect(companyNameWords("AMZN", "Amazon.com, Inc.")).toEqual(["AMZN", "Amazon"]);
  });

  it("keeps a headline naming the company and drops one that does not", () => {
    expect(headlineIsAbout("Does IonQ's NVIDIA Quantum Tie-Up Reframe Rigetti?", words)).toBe(true);
    expect(headlineIsAbout("Why $NVDA fell today", words)).toBe(true);
    expect(headlineIsAbout("Could This Be Novo Nordisk's Next Billion-Dollar Product?", words)).toBe(false);
    expect(headlineIsAbout("Is Dogecoin the Best Crypto You Can Buy Right Now?", words)).toBe(false);
  });

  it("matches whole words, so a short ticker does not match inside another word", () => {
    const ko = companyNameWords("KO", "The Coca-Cola Company");
    expect(headlineIsAbout("Kodak shares jump", ko)).toBe(false);
    expect(headlineIsAbout("KO raises its dividend", ko)).toBe(true);
  });

  it("filters the list when told which company it is for", () => {
    const news = [
      { title: "Is Dogecoin the Best Crypto?", link: "https://a.example/1", publisher: "X" },
      { title: "NVIDIA beats estimates", link: "https://a.example/2", publisher: "Y" },
    ] as never;
    expect(companyArticles(news, 6, { ticker: "NVDA", name: "NVIDIA Corporation" }).map((a) => a.title)).toEqual([
      "NVIDIA beats estimates",
    ]);
    expect(companyArticles(news)).toHaveLength(2);
  });
});
