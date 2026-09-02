/*
  A database error is for us, never for the reader or the wire.

  Postgres and PostgREST write their errors for whoever is holding the
  schema: "duplicate key value violates unique constraint
  portfell_holdings_portfolio_id_ticker_key" names a table, two columns and
  an index in one sentence. Sixty-odd routes used to put that string
  straight into the response body.

  Nobody ever read it. `plainError` already recognises this shape by its
  markers ("violates", "constraint", "column \"") and hands the reader the
  caller's own contextual line instead, so the raw text was doing nothing
  on screen while still being one devtools panel away from describing the
  schema to anyone who asked. The fix is not to hide it better but to stop
  sending it: it belongs in the server log, where the person who can act on
  it is already looking.

  What goes back is `DB_ERROR_MESSAGE`, which `plainError` routes to the
  caller's fallback exactly as it routed the technical text before it. The
  reader sees "Couldn't save your holding." either way; the difference is
  what the response body says next to it.
*/

/**
 * The one string a failed database call may say out loud.
 *
 * Deliberately not a sentence a person would read. `plainError` turns it
 * into the caller's own fallback, which is contextual and therefore
 * always the better line: this constant standing in for it on screen
 * would be a regression, not a fix.
 */
export const DB_ERROR_MESSAGE = "Database error";

/*
  A caught value is `unknown`, and half the call sites are a `catch`: a
  `readAll(..., "throw")` rethrows the driver's error as an `Error`, and a
  whole cron run can throw anything. Read the message off whatever shape
  arrived rather than asking each route to shape it first, because a route
  that has to do that is a route reaching for `.message` itself, which is
  the thing this module exists to stop.
*/
function detailOf(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message.trim();
  }
  return "";
}

/**
 * Log the real error, hand back the safe one.
 *
 * `where` is what makes the log useful, since the response no longer
 * carries anything to correlate against: name the route and the operation
 * ("GET /api/holdings: read holdings"), not the table, which the driver's
 * own message already names.
 */
export function dbError(err: unknown, where: string): string {
  const detail = detailOf(err) || "unknown database error";
  console.error(`[db] ${where}: ${detail}`);
  return DB_ERROR_MESSAGE;
}
