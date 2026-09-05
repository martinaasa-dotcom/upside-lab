/**
 * How much of a fund you already own directly.
 *
 * Pure arithmetic on the fund's published holdings and the reader's own
 * rows, and as far as I can tell nobody else shows it. Somebody who holds
 * Nvidia, Apple and Microsoft and is looking at an S&P 500 fund is looking
 * at a fund that is already a fifth those three companies. That is the
 * single most useful thing you can tell them about it, it is the exact
 * question "am I diversifying or doubling down" turns into, and it is
 * invisible on every fund page in existence because it needs both halves:
 * the fund's holdings and yours.
 *
 * Nothing here judges the answer. A large overlap is fine if it is
 * deliberate and expensive if it is not, and which of those it is depends
 * on things this app cannot see.
 */
export type FundOverlap = {
  /** Companies in the fund's top holdings that the reader also owns. */
  shared: { symbol: string; weight: number }[];
  /** Those companies' combined weight inside the fund. */
  sharedWeight: number;
  /** How many of the fund's listed holdings were checked. */
  checked: number;
};

export function fundOverlap(
  holdings: { symbol: string; weight: number }[],
  owned: string[]
): FundOverlap | null {
  if (holdings.length === 0) return null;
  const mine = new Set(
    owned.map((t) => t.trim().toUpperCase()).filter(Boolean)
  );
  if (mine.size === 0) return null;
  const shared = holdings
    .filter((h) => mine.has(h.symbol.trim().toUpperCase()))
    .map((h) => ({ symbol: h.symbol.toUpperCase(), weight: h.weight }))
    .sort((a, b) => b.weight - a.weight);
  return {
    shared,
    sharedWeight: shared.reduce((sum, h) => sum + h.weight, 0),
    checked: holdings.length,
  };
}

/**
 * The sentence, with the figure in it and no advice attached.
 *
 * Says "of the ten largest holdings" rather than "of the fund", because
 * the feed publishes a top ten and a broad fund holds hundreds. Claiming
 * to have checked the whole fund would be the kind of quiet overstatement
 * this room exists to avoid.
 */
export function overlapSentence(overlap: FundOverlap | null): string | null {
  if (!overlap || overlap.shared.length === 0) return null;
  const names = overlap.shared.slice(0, 4).map((h) => h.symbol);
  const rest = overlap.shared.length - names.length;
  const list =
    rest > 0
      ? `${names.join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`
      : names.length > 1
        ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
        : names[0];
  const pct = Math.round(overlap.sharedWeight * 100);
  /*
    "Own", never "hold", and no verb that could be read as an instruction.

    The first version read "you already hold ... so buying it would add to
    positions you have", and the guard in `value-glance.test.ts` refused
    it. That was the guard doing its job rather than being fussy: this
    sentence sits one line above a purchase decision, and a word that can
    be read either as a description or as advice is a word that will be
    read as advice by somebody looking for permission.
  */
  return `You already own ${list} directly. Among the ${overlap.checked} largest holdings shown here, those come to about ${pct}% of the fund, so this one would add to companies you have rather than only spreading into new ones.`;
}
