import { describe, expect, it } from "vitest";
import {
  businessPath,
  businessStandsDown,
  fairValueRead,
  marketWeight,
} from "@/lib/company/fair-value";
import { makeFacts, makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { buildPlanLadder } from "@/lib/company/plan-ladder";

/**
 * THE COMPANIES SIMPLE METRICS GET WRONG, HELD TO WHAT THE BIG PICTURE SAYS.
 *
 * Each fixture is the feed's own snapshot of the real company on 26
 * September 2026. Before the market's price became a method, Tesla read
 * as worth half its price, a property trust as worth a third of its, a
 * London listing as worth a sixtieth, and Visa as a franchise whose
 * margins were about to halve. Every assertion is a property, never a
 * figure, so the method can be retuned but not taken back to any of these.
 */
const REAL = {
  "TSLA": makeFacts({"ticker":"TSLA","currency":"USD","industry":"Auto Manufacturers","price":372.11,"marketCap":1469666033664,"fiftyTwoWeekHigh":498.83,"fiftyTwoWeekLow":297.38,"revenue":103619002368,"revenueGrowth":0.255,"grossMargin":0.18852,"profitMargin":0.03671,"operatingMargin":0.014099999,"returnOnEquity":0.046669997,"netIncome":3806000128,"totalCash":43524001792,"totalDebt":16080000000,"dividendYield":null,"trailingPe":344.54626,"forwardPe":171.25119,"epsTrailing":1.08,"epsThisYear":1.76531,"epsNextYear":2.17289,"epsGrowthThisYear":0.0634,"epsGrowthNextYear":0.2309,"revenueGrowthNextYear":0.1366,"sharesOutstanding":3949547394,"analystCount":38,"analystTargetMean":396.62158,"analystTargetHigh":600,"analystTargetLow":125,"sector":"Consumer Cyclical","history":[{"year":2022,"revenue":81462000000,"netIncome":12556000000},{"year":2023,"revenue":96773000000,"netIncome":14997000000},{"year":2024,"revenue":97690000000,"netIncome":7091000000},{"year":2025,"revenue":94827000000,"netIncome":3794000000}],"quarters":[{"label":"3Q2025","revenue":28095000000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":24901000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":22387000000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":28236000000,"earnings":null,"margin":null}],"surprises":[{"label":"3Q2025","actual":0.5,"estimate":0.55885,"surprise":-0.10530553815871874,"reportedAt":"2025-10-22T20:06:36.000Z"},{"label":"4Q2025","actual":0.5,"estimate":0.45061,"surprise":0.10960697720867266,"reportedAt":"2026-01-28T21:11:04.000Z"},{"label":"1Q2026","actual":0.41,"estimate":0.34999,"surprise":0.17146204177262192,"reportedAt":"2026-04-22T20:10:44.000Z"},{"label":"2Q2026","actual":0.33,"estimate":0.54236,"surprise":-0.39154804926617,"reportedAt":"2026-07-22T20:35:52.000Z"}]}),
  "V": makeFacts({"ticker":"V","currency":"USD","industry":"Credit Services","price":367.38,"marketCap":689702764544,"fiftyTwoWeekHigh":385.57,"fiftyTwoWeekLow":293.89,"revenue":44487999488,"revenueGrowth":0.144,"grossMargin":0.97725,"profitMargin":0.50782,"operatingMargin":0.66130996,"returnOnEquity":0.6119,"netIncome":22397999104,"totalCash":13792000000,"totalDebt":23857999872,"dividendYield":0.0073,"trailingPe":31.239796,"forwardPe":24.484982,"epsTrailing":11.76,"epsThisYear":13.22816,"epsNextYear":15.0043,"epsGrowthThisYear":0.1533,"epsGrowthNextYear":0.13430001,"revenueGrowthNextYear":0.11,"sharesOutstanding":1704112694,"analystCount":37,"analystTargetMean":419.36163,"analystTargetHigh":466,"analystTargetLow":330,"sector":"Financial Services","history":[{"year":2022,"revenue":29310000000,"netIncome":14957000000},{"year":2023,"revenue":32653000000,"netIncome":17273000000},{"year":2024,"revenue":35926000000,"netIncome":19743000000},{"year":2025,"revenue":40000000000,"netIncome":20058000000}],"quarters":[{"label":"3Q2025","revenue":10724000000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":10901000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":11230000000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":11633000000,"earnings":null,"margin":null}],"surprises":[{"label":"3Q2025","actual":2.98,"estimate":2.97176,"surprise":0.0027727676528386553,"reportedAt":"2025-10-28T20:06:03.000Z"},{"label":"4Q2025","actual":3.17,"estimate":3.14227,"surprise":0.008824830456962652,"reportedAt":"2026-01-29T21:05:49.000Z"},{"label":"1Q2026","actual":3.31,"estimate":3.09955,"surprise":0.06789695278346865,"reportedAt":"2026-04-28T20:05:56.000Z"},{"label":"2Q2026","actual":3.32,"estimate":3.23073,"surprise":0.027631526001863346,"reportedAt":"2026-07-28T20:05:26.000Z"}]}),
  "JPM": makeFacts({"ticker":"JPM","currency":"USD","industry":"Banks - Diversified","price":343.06,"marketCap":911917383680,"fiftyTwoWeekHigh":366.5,"fiftyTwoWeekLow":279.1,"revenue":186328006656,"revenueGrowth":0.304,"grossMargin":0,"profitMargin":0.34921002,"operatingMargin":0.50394,"returnOnEquity":0.17789,"netIncome":63634001920,"totalCash":1526419030016,"totalDebt":1343306989568,"dividendYield":0.019199999,"trailingPe":14.704672,"forwardPe":13.695267,"epsTrailing":23.33,"epsThisYear":24.19431,"epsNextYear":25.04953,"epsGrowthThisYear":0.22629999,"epsGrowthNextYear":0.0353,"revenueGrowthNextYear":0.0278,"sharesOutstanding":2658186195,"analystCount":21,"analystTargetMean":374.2381,"analystTargetHigh":436,"analystTargetLow":305,"sector":"Financial Services","history":[],"quarters":[],"surprises":[{"label":"3Q2025","actual":5.07,"estimate":4.87467,"surprise":0.04007040476586112,"reportedAt":"2025-10-14T10:30:57.000Z"},{"label":"4Q2025","actual":4.63,"estimate":4.81831,"surprise":-0.03908216781402617,"reportedAt":"2026-01-13T11:41:09.000Z"},{"label":"1Q2026","actual":5.94,"estimate":5.51098,"surprise":0.07784822300207955,"reportedAt":"2026-04-14T10:32:42.000Z"},{"label":"2Q2026","actual":6.14,"estimate":5.79998,"surprise":0.058624340083931324,"reportedAt":"2026-07-14T10:30:38.000Z"}]}),
  "O": makeFacts({"ticker":"O","currency":"USD","industry":"REIT - Retail","price":55.54,"marketCap":52552949760,"fiftyTwoWeekHigh":67.94,"fiftyTwoWeekLow":55.07,"revenue":6065508864,"revenueGrowth":0.096,"grossMargin":0.9268,"profitMargin":0.20898001,"operatingMargin":0.46965998,"returnOnEquity":0.03225,"netIncome":1267576960,"totalCash":569948032,"totalDebt":31333789696,"dividendYield":0.0587,"trailingPe":40.540146,"forwardPe":35.76258,"epsTrailing":1.37,"epsThisYear":1.50987,"epsNextYear":1.55302,"epsGrowthThisYear":0.36720002,"epsGrowthNextYear":-0.0427,"revenueGrowthNextYear":0.066300005,"sharesOutstanding":946218033,"analystCount":20,"analystTargetMean":67.2625,"analystTargetHigh":74,"analystTargetLow":59,"sector":"Real Estate","history":[{"year":2022,"revenue":3299657000,"netIncome":869408000},{"year":2023,"revenue":3958150000,"netIncome":872309000},{"year":2024,"revenue":5043748000,"netIncome":847893000},{"year":2025,"revenue":5437332000,"netIncome":1058590000}],"quarters":[{"label":"3Q2025","revenue":1386502000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":1399585000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":1440817000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":1426467000,"earnings":null,"margin":null}],"surprises":[{"label":"3Q2025","actual":0.3575,"estimate":0.40076,"surprise":-0.10794490468110594,"reportedAt":"2025-11-03T21:05:00.000Z"},{"label":"4Q2025","actual":0.3309,"estimate":0.40581,"surprise":-0.18459377541213862,"reportedAt":"2026-02-24T21:05:00.000Z"},{"label":"1Q2026","actual":0.3433,"estimate":0.41723,"surprise":-0.17719243582676222,"reportedAt":"2026-05-06T20:05:00.000Z"},{"label":"2Q2026","actual":0.369,"estimate":0.42274,"surprise":-0.1271230543596537,"reportedAt":"2026-08-05T20:05:00.000Z"}]}),
  "NVO": makeFacts({"ticker":"NVO","currency":"USD","industry":"Drug Manufacturers - General","price":38.8,"marketCap":171371249664,"fiftyTwoWeekHigh":64.16,"fiftyTwoWeekLow":35.12,"revenue":329430990848,"revenueGrowth":0.021,"grossMargin":0.81987,"profitMargin":0.35347,"operatingMargin":0.42540002,"returnOnEquity":0.59815,"netIncome":116442996736,"totalCash":44982001664,"totalDebt":140126994432,"dividendYield":0.0463,"trailingPe":9.724311,"forwardPe":11.5632105,"epsTrailing":3.99,"epsThisYear":22.74775,"epsNextYear":22.04138,"epsGrowthThisYear":-0.0123000005,"epsGrowthNextYear":-0.0311,"revenueGrowthNextYear":0.013200001,"sharesOutstanding":3341913124,"analystCount":12,"analystTargetMean":46.391407,"analystTargetHigh":62.874905,"analystTargetLow":39.73058,"sector":"Healthcare","history":[{"year":2022,"revenue":176954000000,"netIncome":55525000000},{"year":2023,"revenue":232261000000,"netIncome":83683000000},{"year":2024,"revenue":290403000000,"netIncome":100988000000},{"year":2025,"revenue":309064000000,"netIncome":102434000000}],"quarters":[{"label":"3Q2025","revenue":74976000000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":79144000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":70063000000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":78488000000,"earnings":null,"margin":null}],"surprises":[{"label":"3Q2025","actual":4.5,"estimate":4.24333,"surprise":0.06048787155370893,"reportedAt":"2025-11-05T06:30:30.000Z"},{"label":"4Q2025","actual":6.04,"estimate":5.902,"surprise":0.023381904439173144,"reportedAt":"2026-02-03T17:47:39.000Z"},{"label":"1Q2026","actual":6.63,"estimate":6.96067,"surprise":-0.047505484385842234,"reportedAt":"2026-05-06T02:06:46.000Z"},{"label":"2Q2026","actual":6.18,"estimate":4.98333,"surprise":0.24013460878569154,"reportedAt":"2026-08-04T21:23:40.000Z"}]}),
  "AZN.L": makeFacts({"ticker":"AZN.L","currency":"GBP","industry":"Drug Manufacturers - General","price":12552,"marketCap":194668445696,"fiftyTwoWeekHigh":15732,"fiftyTwoWeekLow":9892,"revenue":61366001664,"revenueGrowth":0.064,"grossMargin":0.8169,"profitMargin":0.17021999,"operatingMargin":0.23459,"returnOnEquity":0.21965,"netIncome":10446000128,"totalCash":4968000000,"totalDebt":32349999104,"dividendYield":0.019,"trailingPe":25.05389,"forwardPe":14.656001,"epsTrailing":5.01,"epsThisYear":10.25368,"epsNextYear":11.44976,"epsGrowthThisYear":0.119399995,"epsGrowthNextYear":0.1166,"revenueGrowthNextYear":0.060900003,"sharesOutstanding":1550895914,"analystCount":23,"analystTargetMean":15959.718,"analystTargetHigh":20622.324,"analystTargetLow":11906.292,"sector":"Healthcare","history":[{"year":2022,"revenue":44351000000,"netIncome":3288000000},{"year":2023,"revenue":45811000000,"netIncome":5961000000},{"year":2024,"revenue":54073000000,"netIncome":7035000000},{"year":2025,"revenue":58739000000,"netIncome":10225000000}],"quarters":[{"label":"3Q2025","revenue":15191000000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":15503000000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":15288000000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":15384000000,"earnings":null,"margin":null}],"surprises":[{"label":"3Q2025","actual":2.38,"estimate":2.26974,"surprise":0.04857825125344744,"reportedAt":"2025-11-06T07:00:10.000Z"},{"label":"4Q2025","actual":2.12,"estimate":2.07851,"surprise":0.019961414667237602,"reportedAt":"2026-02-10T07:00:09.000Z"},{"label":"1Q2026","actual":2.58,"estimate":2.52067,"surprise":0.02353739283603173,"reportedAt":"2026-04-29T06:00:08.000Z"},{"label":"2Q2026","actual":2.63,"estimate":2.47468,"surprise":0.06276367045436164,"reportedAt":"2026-07-27T06:00:06.000Z"}]}),
  "HIMS": makeFacts({"ticker":"HIMS","currency":"USD","industry":"Drug Manufacturers - Specialty & Generic","price":29.42,"marketCap":6864080384,"fiftyTwoWeekHigh":65.299,"fiftyTwoWeekLow":13.74,"revenue":2578112000,"revenueGrowth":0.382,"grossMargin":0.69528997,"profitMargin":-0.05509,"operatingMargin":-0.12751001,"returnOnEquity":-0.32033002,"netIncome":-142030000,"totalCash":841048000,"totalDebt":1546238976,"dividendYield":null,"trailingPe":null,"forwardPe":39.90451,"epsTrailing":-0.64,"epsThisYear":-0.56027,"epsNextYear":0.41908,"epsGrowthThisYear":-0.7436,"epsGrowthNextYear":1.61,"revenueGrowthNextYear":0.2459,"sharesOutstanding":224935790,"analystCount":13,"analystTargetMean":31.15385,"analystTargetHigh":42,"analystTargetLow":23,"sector":"Healthcare","history":[{"year":2022,"revenue":526916000,"netIncome":-65678000},{"year":2023,"revenue":872000000,"netIncome":-23546000},{"year":2024,"revenue":1476514000,"netIncome":126038000},{"year":2025,"revenue":2347637000,"netIncome":128365000}],"quarters":[{"label":"3Q2025","revenue":598976000,"earnings":null,"margin":null},{"label":"4Q2025","revenue":617818000,"earnings":null,"margin":null},{"label":"1Q2026","revenue":608104000,"earnings":null,"margin":null},{"label":"2Q2026","revenue":753214000,"earnings":null,"margin":null}],"surprises":[{"label":"3Q2025","actual":0.06,"estimate":0.1017,"surprise":-0.41002949852507375,"reportedAt":"2025-11-03T21:05:00.000Z"},{"label":"4Q2025","actual":0.08,"estimate":0.04155,"surprise":0.9253910950661856,"reportedAt":"2026-02-23T21:05:00.000Z"},{"label":"1Q2026","actual":-0.4,"estimate":0.02557,"surprise":-16.64333202972233,"reportedAt":"2026-05-11T20:15:55.000Z"},{"label":"2Q2026","actual":-0.37,"estimate":-0.05,"surprise":-6.3999999999999995,"reportedAt":"2026-08-10T20:05:00.000Z"}]}),
};

const gapOf = (f: ReturnType<typeof makeFacts>) => {
  const read = fairValueRead(f);
  return read.estimate.price! / f.price! - 1;
};

describe("the market's price is a voice, weighted by how well it is argued", () => {
  it("weighs a giant's price more than a small company's", () => {
    expect(marketWeight(makeOrdinaryFacts({ marketCap: 1e12, analystCount: 40 }))).toBeGreaterThan(
      marketWeight(makeOrdinaryFacts({ marketCap: 2e9, analystCount: 2 }))
    );
    expect(marketWeight(makeOrdinaryFacts({ marketCap: 5e12, analystCount: 60 }))).toBeLessThanOrEqual(0.45);
  });

  it("puts Tesla near its price, with the earnings-only figure set aside and saying why", () => {
    const read = fairValueRead(REAL.TSLA);
    expect(Math.abs(gapOf(REAL.TSLA))).toBeLessThan(0.1);
    const business = read.estimate.dropped.find((m) => m.id === "business");
    expect(business?.dropped).toContain("three times");
  });

  it("never lets the market's own price decide where the price sits", () => {
    const read = fairValueRead(REAL.TSLA);
    // The glance compares the price with the estimates, not with itself.
    expect(read.estimate.used.some((m) => m.id === "market")).toBe(true);
  });
});

describe("what the numbers cannot see is answered rather than mispriced", () => {
  it("leaves a property trust to the analysts and the market, and says why", () => {
    expect(businessStandsDown(REAL.O)).toContain("depreciation");
    expect(businessPath(REAL.O)).toBeNull();
    expect(Math.abs(gapOf(REAL.O))).toBeLessThan(0.15);
  });

  it("prices a bank at the multiple the market has always paid for banks", () => {
    const path = businessPath(REAL.JPM)!;
    expect(path.industry).toBe("banks");
    expect(path.value / REAL.JPM.price!).toBeLessThan(1.3);
  });

  it("keeps a franchise's steady margin rather than pulling it to the average", () => {
    const v = businessPath(REAL.V)!;
    expect(v.durable).toBe(true);
    expect(v.marginSettled).toBeGreaterThan(0.4);
  });

  it("reads a pence listing and a foreign one in the price's own money", () => {
    for (const f of [REAL["AZN.L"], REAL.NVO]) {
      const path = businessPath(f)!;
      expect(path.value / f.price!, f.ticker).toBeGreaterThan(0.5);
      expect(path.value / f.price!, f.ticker).toBeLessThan(2.5);
    }
  });

  it("counts a projection that argues with everybody for less", () => {
    const read = fairValueRead(REAL.HIMS);
    const business = read.estimate.used.find((m) => m.id === "business")!;
    expect(business.weight).toBeLessThan(0.3);
    expect(business.assumes).toContain("counts for half");
  });
});

describe("the newest information moves the number", () => {
  it("leans next year's profit towards a company's habit of beating", () => {
    const beats = [0.08, 0.06, 0.1, 0.07].map((surprise, i) => ({
      label: `Q${i}`,
      actual: 1,
      estimate: 1,
      surprise,
      reportedAt: null,
    }));
    const plain = businessPath(makeOrdinaryFacts())!;
    const beating = businessPath(makeOrdinaryFacts({ surprises: beats }))!;
    expect(beating.surpriseLean).toBeGreaterThan(0);
    expect(beating.value).toBeGreaterThan(plain.value);
  });

  it("lets quarters that accelerate raise next year's growth", () => {
    const quarter = (label: string, revenue: number) => ({ label, revenue, earnings: null, margin: null });
    const flat = businessPath(makeOrdinaryFacts())!;
    const faster = businessPath(
      makeOrdinaryFacts({
        quarters: [quarter("a", 100e6), quarter("b", 125e6), quarter("c", 150e6), quarter("d", 180e6)],
      })
    )!;
    expect(faster.recentGrowth).toBeGreaterThan(0.5);
    expect(faster.growthNextYear).toBeGreaterThan(flat.growthNextYear);
  });

  it("gives a young company's good case more than its bad case takes away", () => {
    const young = businessPath(
      makeOrdinaryFacts({ revenueGrowthNextYear: 0.6, profitMargin: -0.1, epsNextYear: -0.5 })
    )!;
    expect(young.cases.bull - young.cases.base).toBeGreaterThan(young.cases.base - young.cases.bear);
  });
});

describe("the fair value zone widens where the estimate is least certain", () => {
  const ladder = (spread: number | null, typed = false) =>
    buildPlanLadder({
      ticker: "X",
      anchor: 100,
      anchorKind: "estimate",
      anchorSaid: "",
      spot: 85,
      high: 105,
      low: 95,
      estimateSpread: spread,
      override: typed ? { anchor: 100 } : null,
    })!;
  it("is untouched with no disagreement", () => {
    expect(ladder(null).holdHalf).toBe(ladder(0).holdHalf);
  });
  it("widens with the disagreement, and says so", () => {
    expect(ladder(0.6).holdHalf).toBeGreaterThan(ladder(null).holdHalf);
    expect(ladder(0.6).stepSaid).toContain("disagreement");
  });
  it("leaves a reader's own typed anchor alone", () => {
    expect(ladder(0.6, true).holdHalf).toBe(ladder(null, true).holdHalf);
  });
});
