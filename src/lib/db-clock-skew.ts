/*
  A backup that gives up on a clock is a backup gap nobody chose.

  On 2026-09-07 the disaster-recovery cron failed with one word from
  PostgREST: `JWT issued at future` (PGRST303). Nothing in this repository
  mints that token and nothing here can fix it. PostgREST checks the `iat`
  claim on the credential it is handed against its own clock, and a few
  seconds of skew between the node that minted the token and the node that
  reads it is enough for it to refuse the request outright. The same shape
  is `JWT expired` (PGRST301) arriving on a credential that has years left
  on it, which is the same skew with the sign flipped.

  What made it worth writing code about is not the blip, it is what the
  blip cost. The nightly snapshot and the encrypted cold copy are the two
  jobs in this app that exist so that a bad day is recoverable, and both
  read the whole book through one credential: a rejection anywhere in that
  read fails the entire run, the heartbeat pings `/fail`, and the day has
  no backup. `docs/DISASTER_RECOVERY.md` rests on those runs happening.
  Losing one to a few seconds of disagreement between two machines is the
  cheapest failure in the system to not have.

  So the two backup crons retry, and the retry is deliberately narrow.

  It fires ONLY on a credential rejection, which is the one class of
  failure where the request provably never reached Postgres: the gateway
  refused it before any statement ran, so nothing was half-written and a
  second attempt cannot double-write. That is what makes it safe to wrap a
  write (`saveBookSnapshot`) and not just a read. Widen this to a timeout,
  a connection reset, or a plain `500` and that argument is gone -- those
  are exactly the failures that may have already done the work.

  It also does not retry forever. Skew of a few seconds clears on the next
  attempt; skew of an hour is a real fault at the provider and no amount of
  waiting inside a 90 second function will outlast it. Two extra attempts,
  then the run fails and says why, in words that name the cause rather than
  handing Martin the three words PostgREST chose.
*/

/** PostgREST's own codes for a token its clock disagrees with. */
const SKEW_CODES = new Set(["PGRST301", "PGRST302", "PGRST303"]);

const SKEW_MESSAGES = [
  "jwt issued at future",
  "jwt expired",
  "jwt not yet valid",
];

/*
  The chain is walked, not just the top error.

  `during()` (`src/lib/dr/export-book.ts`) wraps each step of the recovery
  job so the alert names which one failed, and it does that by throwing a
  new Error with the step phrase in front of the provider's own sentence
  and the original kept as `cause`. That wrapper is plain, so the
  PostgREST `code` is on the cause rather than on what is thrown. Reading
  only the top error would work today, by the sentence surviving the
  prefix, and would stop working the day a wrapper reworded it.
*/
const MAX_CAUSE_DEPTH = 5;

/**
 * Was this failure a credential the database refused before running
 * anything? True only for the clock-shaped rejections above, anywhere in
 * the cause chain.
 */
export function isCredentialClockRejection(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== "object") return false;
    const source = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof source.code === "string" && SKEW_CODES.has(source.code)) {
      return true;
    }
    const message =
      typeof source.message === "string" ? source.message.toLowerCase() : "";
    if (message && SKEW_MESSAGES.some((phrase) => message.includes(phrase))) {
      return true;
    }
    current = source.cause;
  }
  return false;
}

/** The sentence the error log and the digest get instead of three words. */
export function clockSkewMessage(err: unknown): string {
  const raw =
    err && typeof err === "object" && typeof (err as Error).message === "string"
      ? (err as Error).message
      : String(err);
  return `${raw}. The database refused the credential on its own clock (PostgREST checks the token's issued-at against its own time), so no statement ran. Retried and still refused, which means the skew is larger than a blip: check the Supabase project's status before assuming this app is at fault.`;
}

export type ClockRetryOptions = {
  /** Total attempts, the first one included. */
  attempts?: number;
  /** Waits before attempts 2 and 3. Shorter than any cron's budget. */
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, err: unknown) => void;
};

const DEFAULT_DELAYS = [3_000, 12_000];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `work`, retrying only a credential-clock rejection.
 *
 * Every other failure is rethrown on the first attempt, untouched: this is
 * not a general retry and must not become one.
 */
export async function withClockSkewRetry<T>(
  work: () => Promise<T>,
  opts: ClockRetryOptions = {}
): Promise<T> {
  const delays = opts.delaysMs ?? DEFAULT_DELAYS;
  const attempts = Math.max(1, opts.attempts ?? delays.length + 1);
  const sleep = opts.sleep ?? wait;

  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      if (!isCredentialClockRejection(err)) throw err;
      last = err;
      if (attempt === attempts) break;
      opts.onRetry?.(attempt, err);
      await sleep(delays[attempt - 1] ?? delays[delays.length - 1] ?? 0);
    }
  }

  const err = last instanceof Error ? last : new Error(String(last));
  err.message = clockSkewMessage(last);
  throw err;
}
