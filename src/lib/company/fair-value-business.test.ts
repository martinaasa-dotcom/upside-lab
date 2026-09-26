import { describe, expect, it } from "vitest";
import {
  businessPath,
  fairValueRead,
  requiredReturn,
} from "@/lib/company/fair-value";
import { makeFacts, makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { MARKET_EARNINGS_MULTIPLE } from "@/lib/company/scale";

/**
 * TEN YEARS OF THE BUSINESS, HELD TO THE CASES THAT BROKE THE RULE BEFORE IT.
 *
 * The growth multiple this replaced paid 30 times next year's earnings for
 * growth those earnings already contained. On the feed's own figures of
 * 26 September 2026 it put Nvidia at 70 against a price of 25, Broadcom
 * at 81 above the highest price it had traded at all year, Micron at
 * ,785, and Rocket Lab at .37. Each of these fixtures is that day's
 * snapshot of the real company, trimmed to the fields the method reads,
 * and each assertion is the property the old rule got wrong, never an
 * exact figure: the method may be retuned, and these are what it may not
 * go back to.
 */
const REAL = {
  NVDA: makeFacts({"ticker":"NVDA","price":225.07,"marketCap":5434765213696,"fiftyTwoWeekHigh":236.54,"fiftyTwoWeekLow":164.27,"revenue":302970011648,"revenueGrowth":1.059,"grossMargin":0.74674004,"profitMargin":0.63663,"operatingMargin":0.66236997,"returnOnEquity":1.17211,"netIncome":192880001024,"totalCash":62469001216,"totalDebt":38860001280,"dividendYield":0.0044,"epsTrailing":7.9,"epsThisYear":9.30713,"epsNextYear":15.68263,"epsGrowthThisYear":0.9512,"epsGrowthNextYear":0.685,"revenueGrowthNextYear":0.6589,"sharesOutstanding":24147000000,"analystCount":59,"analystTargetMean":327.7,"analystTargetHigh":515,"analystTargetLow":180,"sector":"Technology","history":[{"year":2023,"revenue":26974000000,"netIncome":4368000000},{"year":2024,"revenue":60922000000,"netIncome":29760000000},{"year":2025,"revenue":130497000000,"netIncome":72880000000},{"year":2026,"revenue":215938000000,"netIncome":120067000000}],"quarters":[{"label":"3Q2025","revenue":57006000000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":68127000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":81615000000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":96221000000,"earnings":null,"margin":null}]}),
  AVGO: makeFacts({"ticker":"AVGO","price":352.81,"marketCap":1684184367104,"fiftyTwoWeekHigh":495,"fiftyTwoWeekLow":289.96,"revenue":89103998976,"revenueGrowth":0.855,"grossMargin":0.75515,"profitMargin":0.42944,"operatingMargin":0.54307,"returnOnEquity":0.44245,"netIncome":38264999936,"totalCash":23975000064,"totalDebt":59419000832,"dividendYield":0.0074,"epsTrailing":7.74,"epsThisYear":11.65832,"epsNextYear":19.38135,"epsGrowthThisYear":0.7094,"epsGrowthNextYear":0.6624,"revenueGrowthNextYear":0.6373,"sharesOutstanding":4773629865,"analystCount":47,"analystTargetMean":531.8468,"analystTargetHigh":715,"analystTargetLow":215.88,"sector":"Technology","history":[{"year":2022,"revenue":33203000000,"netIncome":11495000000},{"year":2023,"revenue":35819000000,"netIncome":14082000000},{"year":2024,"revenue":51574000000,"netIncome":5895000000},{"year":2025,"revenue":63887000000,"netIncome":23126000000}],"quarters":[{"label":"2Q2025","revenue":15952000000,"earnings":null,"margin":null},{"label":"3Q2025","revenue":18015000000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":19311000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":22187000000,"earnings":null,"margin":null}]}),
  MU: makeFacts({"ticker":"MU","price":1082.28,"marketCap":1222319669248,"fiftyTwoWeekHigh":1255,"fiftyTwoWeekLow":159.97,"revenue":90273996800,"revenueGrowth":3.457,"grossMargin":0.72569,"profitMargin":0.55906,"operatingMargin":0.80370003,"returnOnEquity":0.66638,"netIncome":50468999168,"totalCash":26022000640,"totalDebt":6376000000,"dividendYield":0.0005,"epsTrailing":44.27,"epsThisYear":73.60099,"epsNextYear":159.49178,"epsGrowthThisYear":7.8783,"epsGrowthNextYear":1.1669999,"revenueGrowthNextYear":0.9103,"sharesOutstanding":1129393151,"analystCount":46,"analystTargetMean":1515.5435,"analystTargetHigh":2200,"analystTargetLow":361,"sector":"Technology","history":[],"quarters":[]}),
  KO: makeFacts({"ticker":"KO","price":87.81,"marketCap":377806815232,"fiftyTwoWeekHigh":92.49,"fiftyTwoWeekLow":65.35,"revenue":50128998400,"revenueGrowth":0.067,"grossMargin":0.61888003,"profitMargin":0.28558,"operatingMargin":0.34873,"returnOnEquity":0.42054,"netIncome":14316000256,"totalCash":16371000320,"totalDebt":44260999168,"dividendYield":0.0241,"epsTrailing":3.33,"epsThisYear":3.30148,"epsNextYear":3.52638,"epsGrowthThisYear":0.1005,"epsGrowthNextYear":0.0681,"revenueGrowthNextYear":0.0025,"sharesOutstanding":4302549243,"analystCount":23,"analystTargetMean":94.69565,"analystTargetHigh":104,"analystTargetLow":75,"sector":"Consumer Defensive","history":[{"year":2022,"revenue":43046000000,"netIncome":9542000000},{"year":2023,"revenue":45784000000,"netIncome":10714000000},{"year":2024,"revenue":46897000000,"netIncome":10631000000},{"year":2025,"revenue":48062000000,"netIncome":13107000000}],"quarters":[{"label":"3Q2025","revenue":12412000000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":11817000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":12471000000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":13373000000,"earnings":null,"margin":null}]}),
  RKLB: makeFacts({"ticker":"RKLB","price":73.95,"marketCap":47284441088,"fiftyTwoWeekHigh":151,"fiftyTwoWeekLow":37.57,"revenue":769145984,"revenueGrowth":0.62,"grossMargin":0.37264,"profitMargin":-0.21511999,"operatingMargin":-0.24572,"returnOnEquity":-0.07915,"netIncome":-165459008,"totalCash":2302184960,"totalDebt":133691000,"dividendYield":null,"epsTrailing":-0.29,"epsThisYear":-0.27385,"epsNextYear":-0.08733,"epsGrowthThisYear":0.765,"epsGrowthNextYear":2.063,"revenueGrowthNextYear":0.42180002,"sharesOutstanding":598459739,"analystCount":19,"analystTargetMean":109.36842,"analystTargetHigh":150,"analystTargetLow":64,"sector":"Industrials","history":[{"year":2022,"revenue":210996000,"netIncome":-135944000},{"year":2023,"revenue":244592000,"netIncome":-182571000},{"year":2024,"revenue":436214000,"netIncome":-190175000},{"year":2025,"revenue":601799000,"netIncome":-198209000}],"quarters":[{"label":"3Q2025","revenue":155080000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":179652000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":200348000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":234066000,"earnings":null,"margin":null}]}),
  CRWV: makeFacts({"ticker":"CRWV","price":87.59,"marketCap":48309088256,"fiftyTwoWeekHigh":153.2,"fiftyTwoWeekLow":60.55,"revenue":7590000128,"revenueGrowth":1.125,"grossMargin":0.67418,"profitMargin":-0.25402,"operatingMargin":-0.01903,"returnOnEquity":-0.43596,"netIncome":-1928000000,"totalCash":5538999808,"totalDebt":51612999680,"dividendYield":null,"epsTrailing":-3.55,"epsThisYear":-5.07767,"epsNextYear":-4.14868,"epsGrowthThisYear":-1.8424001,"epsGrowthNextYear":0.5387,"revenueGrowthNextYear":1.0486,"sharesOutstanding":458871690,"analystCount":37,"analystTargetMean":141.08109,"analystTargetHigh":317,"analystTargetLow":39,"sector":"Technology","history":[{"year":2025,"revenue":5131000000,"netIncome":-1196000000}],"quarters":[{"label":"3Q2025","revenue":1364676000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":1572000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":2078000000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":2575000000,"earnings":null,"margin":null}]}),
};

const today = (f: ReturnType<typeof makeFacts>) => fairValueRead(f).estimate.price!;

describe("the cases that broke the old rule", () => {
  it("no longer pays twice for Nvidia's growth", () => {
    const nvda = REAL.NVDA;
    const fair = today(nvda);
    // The old blend said 88.89; the analysts' own average is 27.70.
    expect(fair).toBeLessThan(nvda.analystTargetMean!);
    expect(fair).toBeGreaterThan(nvda.price!);
    // And the method itself stays well under 30 times next year's profit.
    const path = businessPath(nvda)!;
    expect(path.value / nvda.epsNextYear!).toBeLessThan(26);
  });

  it("keeps Broadcom's fair value inside what it has actually traded at", () => {
    const avgo = REAL.AVGO;
    expect(today(avgo)).toBeLessThan(avgo.fiftyTwoWeekHigh!);
  });

  it("treats a profit that just multiplied as possibly the top of a cycle", () => {
    const mu = REAL.MU;
    const path = businessPath(mu)!;
    expect(path.peak).toBe(true);
    // Micron is still cheap on its own earnings, and the reading may say so,
    // but nowhere near the ,785 the old rule printed.
    expect(today(mu)).toBeGreaterThan(mu.price!);
    expect(today(mu)).toBeLessThan(mu.price! * 2);
  });

  it("never calls a company's first profit the top of a cycle", () => {
    // Same surge in earnings, on a company whose history is losses.
    const ramp = makeFacts({
      ...REAL.MU,
      history: [
        { year: 2023, revenue: 1e9, netIncome: -2e8 },
        { year: 2024, revenue: 2e9, netIncome: -1e8 },
        { year: 2025, revenue: 4e9, netIncome: 1e8 },
      ],
    });
    expect(businessPath(ramp)!.peak).toBe(false);
  });

  it("gives a small company growing fast on no profit a value above nothing", () => {
    // Rocket Lab came out at .37 under the old rule.
    const rklb = businessPath(REAL.RKLB)!;
    expect(rklb.marginNextYear).toBeLessThan(0);
    expect(rklb.marginYearTen).toBeGreaterThan(0.05);
    expect(rklb.value).toBeGreaterThan(5);
  });

  it("charges a heavily borrowed, loss-making company a higher return", () => {
    const crwv = requiredReturn(REAL.CRWV);
    expect(crwv.rate).toBeGreaterThan(requiredReturn(REAL.KO).rate);
    expect(crwv.why).toContain("not yet profitable");
    expect(crwv.why).toContain("heavily borrowed");
  });
});

describe("growth is worth what the arithmetic says, in both directions", () => {
  it("lands a company growing at the market's pace on the market's own multiple", () => {
    /*
      The anchor that keeps every constant honest: none of them may move an
      ordinary company away from what the market pays for one.
    */
    const ordinary = makeOrdinaryFacts({
      revenue: 10e9,
      revenueGrowthNextYear: 0.07,
      grossMargin: 0.5,
      profitMargin: 0.21,
      netIncome: 2.1e9,
      epsTrailing: 2.1e9 / (1e9 * 0.214),
      epsNextYear: 10,
      sharesOutstanding: 1e9 * 0.214,
      marketCap: 200e9,
      price: 200e9 / (1e9 * 0.214),
      returnOnEquity: 0.2,
      fiftyTwoWeekHigh: 1000,
      fiftyTwoWeekLow: 800,
      totalDebt: 0,
      totalCash: 0,
      history: [],
    });
    const path = businessPath(ordinary)!;
    expect(path.value / 10).toBeGreaterThan(MARKET_EARNINGS_MULTIPLE * 0.9);
    expect(path.value / 10).toBeLessThan(MARKET_EARNINGS_MULTIPLE * 1.1);
  });

  it("pays more for the same profit when it is growing faster", () => {
    const slow = businessPath(makeOrdinaryFacts({ revenueGrowthNextYear: 0.03 }))!;
    const fast = businessPath(makeOrdinaryFacts({ revenueGrowthNextYear: 0.4 }))!;
    expect(fast.value).toBeGreaterThan(slow.value * 1.3);
  });

  it("lets a small company keep growing for longer than a giant", () => {
    const small = businessPath(makeOrdinaryFacts({ revenueGrowthNextYear: 0.4 }))!;
    const giant = businessPath(
      makeOrdinaryFacts({ revenueGrowthNextYear: 0.4, revenue: 400e9 })
    )!;
    expect(small.growthYearTen).toBeGreaterThan(giant.growthYearTen);
  });

  it("does not move with today's price", () => {
    const at = (price: number) =>
      businessPath(makeOrdinaryFacts({ price, marketCap: price * 10_000_000 }))!.value;
    expect(at(50)).toBeCloseTo(at(500), 6);
  });

  it("pulls an extraordinary margin back harder than an ordinary one", () => {
    const nvda = businessPath(REAL.NVDA)!;
    expect(nvda.marginYearTen).toBeLessThan(nvda.marginNextYear);
  });
});

describe("the analysts' target is a price in a year, so it is brought back to today", () => {
  it("is discounted at the company's own required return", () => {
    const f = makeOrdinaryFacts({ revenueGrowthNextYear: null, revenueGrowth: null });
    const read = fairValueRead(f);
    const consensus = read.estimate.used.find((m) => m.id === "consensus")!;
    expect(consensus.price).toBeCloseTo(130 / (1 + requiredReturn(f).rate), 2);
    expect(consensus.working).toContain("brought back to today");
  });
});
