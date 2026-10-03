/**
 * Whether a polled figure is in the same money as the page's own.
 *
 * A quote carries two prices: `price`, converted to dollars, and
 * `nativePrice`, in whatever the exchange quotes, which for a London
 * listing is pence while the page's figures are folded to pounds. The
 * right one is picked by the page's currency, and then checked against
 * the page's own figure: nothing real moves a share to half or double its
 * price between two loads of one page, so a figure that far out is a unit
 * mismatch and is dropped rather than placed in the wrong zone.
 */
export function sameMoney(
  quote: { price?: number | null; nativePrice?: number | null } | undefined,
  code: string,
  pagePrice: number | null
): number | null {
  if (!quote) return null;
  const pick = code === "USD" ? quote.price ?? quote.nativePrice : quote.nativePrice;
  if (typeof pick !== "number" || !Number.isFinite(pick) || !(pick > 0)) return null;
  if (typeof pagePrice === "number" && pagePrice > 0) {
    const ratio = pick / pagePrice;
    if (ratio < 0.5 || ratio > 2) return null;
  }
  return pick;
}
