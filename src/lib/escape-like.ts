/*
  A value that has to mean itself inside a LIKE pattern.

  `.ilike("email", email)` reads as "the same address, whatever the case",
  and it is not: `%` matches any run of characters and `_` matches any one,
  so an address holding either is a pattern rather than a value. The only
  place this app filters on a LIKE is the unsubscribe route, where the value
  is an address read off a profile row and the update switches off the Sunday
  letter for every row it matches. An address with a wildcard in it would
  switch it off for strangers.

  Postgres reads a backslash as the escape in a LIKE pattern by default, so
  the backslash itself is escaped first, then the two wildcards.

  What this cannot fix is `*`. PostgREST turns every `*` into `%` before the
  pattern reaches Postgres, as an alias for people writing filters by hand,
  and an escaped `\*` becomes `\%`, which is a literal percent sign and not a
  literal star. `likeCanBeExact` says whether a value survives the trip, and
  a caller whose value does not should fall back to something narrower rather
  than send a pattern that reads wider than the value.
*/

/** The value with `\`, `%` and `_` escaped so a LIKE matches it literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** False for a value PostgREST would still read as a pattern after escaping. */
export function likeCanBeExact(value: string): boolean {
  return !value.includes("*");
}
