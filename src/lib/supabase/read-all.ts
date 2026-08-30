/*
  Reading a whole answer, however long it is.

  PostgREST does not return every row it matched. It returns at most
  db-max-rows, which a Supabase project is set to 1,000 by default, and it
  applies that silently: no error, no flag, just a shorter list. Every read in
  this app was written as though that were not true.

  This is for the reads where the rows genuinely are the answer and no
  aggregate replaces them: a nightly snapshot of every portfolio and every
  holding, the Sunday letter's one batched read across every recipient, and a
  person's export of their own data. Each of those is complete or it is
  wrong, and each was written as one request.

  Upside Arena has this file, with these numbers, for the same reason. The two
  apps are one design, so fix both or neither.

  The page size is deliberately below the default cap rather than at it. A
  loop that asks for exactly as many rows as it is allowed cannot tell a full
  page from a truncated one.

  The builder MUST carry a deterministic, unique order (`.order(...)` ending
  on a primary-key column). Each page is its own statement, and Postgres
  makes no promise about the order of an unordered scan between statements:
  synchronized and parallel sequential scans genuinely start at different
  points run to run, so two unordered pages can overlap or gap and the walk
  returns duplicated or missing rows with nothing failing. A non-unique
  order (`sort_order`, `created_at`) has the same hole at every tie that
  straddles a page boundary, which is why the call sites order by the key
  as the final term. `read-all-ordering.test.ts` is the floor.
*/

const PAGE = 500;

/*
  Enough pages for any real answer, and a stop.

  Without a ceiling a misbehaving range would spin forever inside a page
  render. Half a million rows is far past anything this app asks for, so
  reaching it means something is wrong with the query rather than with the
  limit.
*/
const MAX_PAGES = 1000;

type Page<T> = { data: T[] | null; error: unknown };
type Ranged<T> = { range: (from: number, to: number) => PromiseLike<Page<T>> };

/**
 * What to do when a page fails.
 *
 * "stop" hands back what has been read so far, which is how every room
 * already treats a failed read: draw with less rather than not at all.
 *
 * "throw" is for the callers where a short answer is worse than no answer. A
 * snapshot missing most of its rows and looking exactly like a good one is
 * worse than a backup that failed and said so.
 */
export type OnPageError = "stop" | "throw";

/**
 * Every row a query matches, fetched a page at a time.
 *
 * Takes the query builder rather than the promise, because each page is a
 * separate request and the builder is what can be given a different range.
 * Supabase's builders are single-use once awaited, so the caller passes a
 * function that makes a fresh one.
 */
/*
  Throwing without losing what the driver said.

  PostgREST errors arrive as plain objects, not `Error` instances:
  `{ message, details, hint, code }`. Wrapping one in `new Error(message)`
  therefore keeps the sentence and silently drops `code`, which is the
  field callers actually branch on -- `note-cron` reads `42703` to tell a
  column that has not been migrated yet from a real failure, and degrades
  instead of dropping everybody's letter. That branch is unreachable if
  the code does not survive the throw, and nothing would have failed to
  say so: the message-matching fallback beside it would quietly carry the
  case until the day a message was worded differently.

  So the properties come with it.
*/
function asError(error: unknown): Error {
  if (error instanceof Error) return error;

  const source = (error ?? {}) as Record<string, unknown>;
  const message =
    typeof source.message === "string" && source.message
      ? source.message
      : "read failed part way";
  const err = new Error(message);

  for (const [key, value] of Object.entries(source)) {
    if (key === "message") continue;
    Object.defineProperty(err, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return err;
}

export async function readAll<T>(
  build: () => Ranged<T>,
  onError: OnPageError = "stop"
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await build().range(from, from + PAGE - 1);

    if (error) {
      if (onError === "throw") {
        throw asError(error);
      }
      break;
    }

    const batch = data ?? [];
    rows.push(...batch);

    // A short page is the last page. A full one might not be.
    if (batch.length < PAGE) break;
  }

  return rows;
}
