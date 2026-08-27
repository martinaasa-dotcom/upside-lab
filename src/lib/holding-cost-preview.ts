import { currency } from "@/lib/format";
import { isSafePositiveMoney, isSafeShares } from "@/lib/input-guard";
import { listingPriceDigits } from "@/lib/listing-currency";
import { parseDecimal } from "@/lib/number-input";

/**
 * The two numbers on the add-holding form, read back as arithmetic.
 *
 * A reader told us they could not tell whether the second box wanted a
 * purchase price or a date, and their friend hit the same wall. Relabelling
 * helps, but a label is a promise and this is proof: the moment both boxes
 * hold something usable the form says "37 × $109.96 is $4,068.52 put into
 * this name", which can only be read one way. It also catches the swap,
 * since 110 shares at $37 looks obviously wrong to somebody who meant the
 * other way round.
 *
 * Pure, and shared by the modal and the walkthrough's own copy of the form,
 * because a first holding is typed as often in one as the other.
 *
 * Returns null while either box is empty or out of range, so the line
 * appears when it can be trusted and never argues with the error message.
 */
export function holdingCostPreview(
  sharesText: string,
  priceText: string,
  code: string
): { shares: string; each: string; total: string } | null {
  const shares = parseDecimal(sharesText);
  const price = parseDecimal(priceText);
  if (!isSafeShares(shares) || !isSafePositiveMoney(price)) return null;
  const digits = listingPriceDigits(code);
  return {
    // Fractional shares are real here, so the count is shown as typed
    // rather than rounded into a whole number the reader did not write.
    shares: shares.toLocaleString("en-US", { maximumFractionDigits: 4 }),
    each: currency(price, digits, code),
    total: currency(shares * price, digits, code),
  };
}
