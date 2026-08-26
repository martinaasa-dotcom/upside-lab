import { finiteNumber, roundMoney } from "@/lib/money";

/** Paper class sheets keep a cash ledger. Real books do not. */
export function tracksTradeCash(portfolio: {
  classroom_community_id?: string | null;
}): boolean {
  return Boolean(portfolio.classroom_community_id);
}

/**
 * Cash that counts toward the total, and it can be below zero. A brokerage
 * account that lent you money to buy with carries a negative cash line, so
 * clamping it at zero told somebody who owed $7,000 that they owed nothing
 * and quietly added that $7,000 back to their portfolio value. `alerts.ts`
 * has said "part of your portfolio is borrowed" under -$500 all along; the
 * clamp is what kept it from ever firing on a real portfolio.
 */
export function sheetCashBalance(portfolio: {
  cash_balance: number;
  classroom_community_id?: string | null;
}): number {
  return roundMoney(finiteNumber(portfolio.cash_balance));
}
