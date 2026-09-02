/**
 * What changed in the circle since you last looked.
 *
 * A circle was a static snapshot: open it twice in a week and it says the
 * same thing both times, so there was no reason to come back except the
 * duel. The cheapest honest version of a feed needs no new table, because
 * the circle's whole book is already cached per circle in localStorage
 * (`loadCommunityCache`). Diff the copy that was there when the reader
 * arrived against the one the server just handed back, and you have "Rasmus
 * added $AMD. Liisa sold $PFE."
 *
 * Two rules the copy has to keep.
 *
 * It never prints a number of shares or a sum of money, for the same reason
 * the rest of the circle does not: "Rasmus added 400 shares of $AMD" is a
 * statement about how much money Rasmus has. Bought, sold, added to, trimmed.
 *
 * And it only speaks when it is sure, in both directions. A cache from
 * before somebody joined would read every one of their holdings as bought
 * this week, so a person absent from the cached copy is skipped; and a
 * person who has since stopped sharing would read as having sold
 * everything, so one who no longer owns anything the circle can see is
 * skipped too.
 */

export type CircleBookSnapshot = {
  ownership: { portfolio_id: string; user_id: string }[];
  holdings: { portfolio_id: string; ticker: string; shares: number }[];
};

export type CircleChange = {
  key: string;
  personId: string;
  person: string;
  ticker: string;
  kind: "bought" | "sold" | "added" | "trimmed";
};

/** A tenth of the position, so a dividend reinvestment is not news. */
const MEANINGFUL_SHARE_MOVE = 0.1;

function sharesByPersonAndTicker(
  snapshot: CircleBookSnapshot
): Map<string, Map<string, number>> {
  const ownerOfPortfolio = new Map<string, string>();
  for (const o of snapshot.ownership) {
    if (!ownerOfPortfolio.has(o.portfolio_id)) {
      ownerOfPortfolio.set(o.portfolio_id, o.user_id);
    }
  }
  const out = new Map<string, Map<string, number>>();
  for (const h of snapshot.holdings) {
    const person = ownerOfPortfolio.get(h.portfolio_id);
    if (!person) continue;
    const shares = Number(h.shares);
    if (!Number.isFinite(shares) || shares <= 0) continue;
    const ticker = String(h.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    const row = out.get(person) ?? new Map<string, number>();
    row.set(ticker, (row.get(ticker) ?? 0) + shares);
    out.set(person, row);
  }
  return out;
}

/**
 * Every change worth a line, oldest people first is meaningless here so the
 * order is: whole companies before size changes, then alphabetical by
 * person, which is stable across a re-render.
 */
export function circleChanges(
  before: CircleBookSnapshot | null,
  after: CircleBookSnapshot,
  personName: (id: string) => string
): CircleChange[] {
  if (!before) return [];
  const was = sharesByPersonAndTicker(before);
  const now = sharesByPersonAndTicker(after);
  /*
    Walked from `was`, not from `now`, and this is the case the obvious loop
    misses: somebody who sold their last holding has no rows at all in the
    fresh copy, so a walk over `now` never reaches them and the loudest
    change a person can make is the one it cannot see.

    The mirror of that is somebody who stopped sharing a portfolio, which
    would read as selling everything they own. `stillHere` is the guard: a
    person who no longer owns anything the circle can see has not sold, they
    have left, and the circle is not told either way.
  */
  const stillHere = new Set(after.ownership.map((o) => o.user_id));
  const out: CircleChange[] = [];

  for (const [personId, wasRow] of was) {
    if (!stillHere.has(personId)) continue;
    const nowRow = now.get(personId) ?? new Map<string, number>();
    const tickers = new Set([...wasRow.keys(), ...nowRow.keys()]);
    for (const ticker of tickers) {
      const previous = wasRow.get(ticker) ?? 0;
      const current = nowRow.get(ticker) ?? 0;
      if (previous === current) continue;
      let kind: CircleChange["kind"];
      if (previous === 0) kind = "bought";
      else if (current === 0) kind = "sold";
      else {
        const move = Math.abs(current - previous) / previous;
        if (move < MEANINGFUL_SHARE_MOVE) continue;
        kind = current > previous ? "added" : "trimmed";
      }
      out.push({
        key: `${personId}|${ticker}|${kind}`,
        personId,
        person: personName(personId),
        ticker,
        kind,
      });
    }
  }

  const wholeCompany = (c: CircleChange) =>
    c.kind === "bought" || c.kind === "sold" ? 0 : 1;
  out.sort(
    (a, b) =>
      wholeCompany(a) - wholeCompany(b) ||
      a.person.localeCompare(b.person) ||
      a.ticker.localeCompare(b.ticker)
  );
  return out;
}

const VERB: Record<CircleChange["kind"], string> = {
  bought: "bought",
  sold: "sold",
  added: "added to",
  trimmed: "trimmed",
};

/** "Rasmus bought $AMD." One sentence, one person, one company. */
export function circleChangeSentence(
  change: CircleChange,
  cashtag: (t: string) => string
): string {
  return `${change.person} ${VERB[change.kind]} ${cashtag(change.ticker)}.`;
}
