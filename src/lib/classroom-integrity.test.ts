import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  A paper class is a league, and a league is only worth playing if the
  numbers behind it are not something a player can type. Two ways they were.

  A classroom portfolio is owned by the student, so every ownership check
  passes. `cash_balance` was gated only by the class period, whose default is
  "open", so any student could set their own starting money to whatever they
  liked. And a paper buy was debited at the price in the request, so buying
  100,000 shares of a $180 company at a cent cost a thousand dollars and was
  worth eighteen million a moment later.

  ClassroomRoster ranks on (value - startingCash) / startingCash, so either
  move is first place in the class, and nothing on any screen looks wrong
  afterwards, because every figure downstream adds up correctly from a
  number that was a lie.
*/
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a student cannot set their own paper cash", () => {
  const guard = read("src/lib/classroom-guard.ts");
  const route = read("src/app/api/portfolios/route.ts");

  it("asks who the caller is, not what the period allows", () => {
    /*
      The period was never the right question. Starting money is the
      teacher's to set through the classroom route, and after that a
      balance is the ledger's answer rather than anybody's opinion. So the
      new guard turns on being an admin of the class, in every period.
    */
    expect(guard).toContain("export async function denyStudentCashWrite");
    const fn = guard.slice(guard.indexOf("export async function denyStudentCashWrite"));
    expect(fn).toContain("userIsCommunityAdmin");
    expect(fn).not.toContain("allowClassAction");
  });

  it("runs before the cash write on the portfolios route", () => {
    const patch = route.slice(route.indexOf("if (body.cash_balance !== undefined)"));
    const refusal = patch.indexOf("denyStudentCashWrite");
    const write = patch.indexOf("patch.cash_balance =");
    expect(refusal).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(refusal);
  });

  it("leaves an ordinary portfolio alone", () => {
    // Typing what a broker shows, borrowed money included, is exactly what
    // cash_balance is for. The guard answers null with no classroom id.
    const fn = guard.slice(guard.indexOf("export async function denyStudentCashWrite"));
    expect(fn).toContain("if (!communityId) return null;");
  });

  it("says why in words a student would understand", () => {
    const fn = guard.slice(guard.indexOf("export async function denyStudentCashWrite"));
    expect(fn).toContain("Your teacher sets the starting money");
    expect(fn).not.toMatch(/[—–]/);
    expect(fn).not.toMatch(/\b(unauthorized|forbidden|denied)\b/i);
  });
});

describe("a paper trade prices at the market", () => {
  const holdings = read("src/app/api/holdings/route.ts");

  it("buys at the server's own quote on a class portfolio", () => {
    expect(holdings).toContain(
      "const tradePrice = context.tracksTradeCash"
    );
    expect(holdings).toContain("? await salePriceFor(ticker, buyPrice)");
    expect(holdings).toContain("buyPrice: tradePrice");
  });

  it("stores that price too, so no gain appears that nobody made", () => {
    expect(holdings).toContain(
      "if (context.tracksTradeCash) row.buy_price = roundMoney(tradePrice);"
    );
  });

  it("prices a class buy on the edit path as well", () => {
    // Adding shares to an existing holding, and moving to another company,
    // are both buys and were both taking the request's price.
    expect(holdings).toContain("const classBuyPx =");
    expect(holdings).toContain("buyPrice: classBuyPx ?? (nextBuy || prevBuy)");
  });

  it("pays for the walk only where the answer is spent", () => {
    /*
      An ordinary portfolio does not move cash on a trade and its buy price
      is a fact about somebody's own broker, so it neither pays for a quote
      nor has its figure corrected. That is the perf rule and the honesty
      rule pointing the same way.
    */
    expect(holdings).toContain("context.tracksTradeCash\n    ? await salePriceFor");
  });
});
