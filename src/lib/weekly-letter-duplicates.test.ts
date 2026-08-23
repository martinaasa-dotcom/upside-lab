/**
 * Three identical Sunday letters, in one inbox, on 2026-08-23.
 *
 * `vercel.json` fires `/api/cron/sunday-note` three times on a Sunday: the
 * 04:00 run and two `?resume=1` slots that pick up anyone the first run
 * did not reach. The marker column exists precisely so the later two skip
 * whoever already has the letter -- but `noteTestAudience` decided "is
 * this the scheduler?" from an `x-vercel-cron: 1` header that Vercel does
 * not document and does not send. Every slot fell through to the manual
 * branch, which treated itself as a test: it ignored the marker *and*
 * declined to write one. So all three sent, to Martin alone, and nobody
 * else opted in ever received the letter at all.
 *
 * These tests pin both halves: what counts as a scheduled run, and that
 * duplicate protection no longer depends on getting that answer right.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Profile = {
  id: string;
  email: string;
  display_name: string;
  note_sunday_sent_at: string | null;
};

let profiles: Profile[] = [];
const sends: { to: string; idempotencyKey?: string }[] = [];
/** The next send fails, the way a provider outage fails. */
let failNextSend = false;

/**
 * The reader is Martin, because the branch under test -- an unrecognised
 * caller -- narrows the audience to him. Using anyone else here would test
 * the allowlist rather than the duplicate protection.
 */
const READER = "martin.aasa@upthink.ee";

/** One reader, one portfolio, one holding: enough to earn a letter. */
const OTHER_ROWS: Record<string, unknown[]> = {
  portfell_portfolio_owners: [{ user_id: "u1", portfolio_id: "b1" }],
  portfell_portfolios: [
    { id: "b1", cash_balance: 1000, classroom_community_id: null },
  ],
  portfell_holdings: [
    { portfolio_id: "b1", ticker: "NVDA", shares: 10, buy_price: 100 },
  ],
};

/** Enough of PostgREST to model a conditional update honestly. */
function builder(table: string) {
  let mode: "select" | "update" = "select";
  let patch: Record<string, unknown> = {};
  let emails: string[] | null = null;
  let staleBefore: number | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: (_col: string, values: string[]) => {
      emails = values;
      return chain;
    },
    or: (filter: string) => {
      // The only `.or` in this file is the claim's "marker is null or
      // older than the resend window" guard. Read the cutoff out of it so
      // last week's marker really does free the row.
      const cutoff = /note_sunday_sent_at\.lt\.(\S+)$/.exec(filter)?.[1];
      staleBefore = cutoff ? new Date(cutoff).getTime() : 0;
      return chain;
    },
    update: (next: Record<string, unknown>) => {
      mode = "update";
      patch = next;
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => {
      if (table !== "portfell_profiles") {
        return Promise.resolve(resolve({ data: OTHER_ROWS[table] ?? [], error: null }));
      }
      if (mode === "select") {
        return Promise.resolve(resolve({ data: profiles, error: null }));
      }
      const claimable = (p: Profile) =>
        staleBefore === null ||
        p.note_sunday_sent_at === null ||
        new Date(p.note_sunday_sent_at).getTime() < staleBefore;
      const hit = profiles.filter(
        (p) => (!emails || emails.includes(p.email)) && claimable(p)
      );
      for (const p of hit) {
        p.note_sunday_sent_at = patch.note_sunday_sent_at as string | null;
      }
      return Promise.resolve(resolve({ data: hit, error: null }));
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => ({ from: (t: string) => builder(t) }),
  supabaseUsesServiceRole: () => true,
}));
vi.mock("@/lib/send-note", () => ({
  noteEmailConfigured: () => true,
  sendNoteEmail: (input: { to: string; idempotencyKey?: string }) => {
    if (failNextSend) {
      failNextSend = false;
      return Promise.resolve(false);
    }
    sends.push({ to: input.to, idempotencyKey: input.idempotencyKey });
    return Promise.resolve(true);
  },
}));
vi.mock("@/lib/market/quotes", () => ({
  fetchQuotesWithFallback: (t: string[]) =>
    Promise.resolve({
      quotes: Object.fromEntries(t.map((x) => [x, { price: 100 }])),
    }),
}));
vi.mock("@/lib/market/yahoo", () => ({
  // Real week data for the one holding, or the letter would (rightly)
  // refuse to state a week it cannot back up.
  fetchWeekReturns: () =>
    Promise.resolve({ NVDA: { start: 96, end: 100, pct: 0.0417 } }),
  fetchMarketEvents: () => Promise.resolve({ earnings: [] }),
}));
vi.mock("@/lib/weekly-margus", () => ({
  writeWeeklyTake: async () => "A take.",
}));

const { dispatchWeeklyLetters, letterWeekKey, noteTestAudience } = await import(
  "@/lib/note-cron"
);
const { requestIsScheduledCron } = await import("@/lib/cron-auth");

const CRON_URL = "https://upsidelab.app/api/cron/sunday-note";

beforeEach(() => {
  profiles = [
    {
      id: "u1",
      email: READER,
      display_name: "Reader",
      note_sunday_sent_at: null,
    },
  ];
  sends.length = 0;
  failNextSend = false;
});

describe("what counts as the scheduler calling", () => {
  it("recognises the header Vercel actually sends", () => {
    const req = new Request(CRON_URL, {
      headers: { "x-vercel-cron-schedule": "0 4 * * 0" },
    });
    expect(requestIsScheduledCron(req)).toBe(true);
    // Everyone opted in, not just Martin -- the regression that hid the
    // letter from every other reader.
    expect(noteTestAudience(req).onlyEmails).toBeUndefined();
  });

  it("still recognises the undocumented header and the cron user agent", () => {
    expect(
      requestIsScheduledCron(
        new Request(CRON_URL, { headers: { "x-vercel-cron": "1" } })
      )
    ).toBe(true);
    expect(
      requestIsScheduledCron(
        new Request(CRON_URL, { headers: { "user-agent": "vercel-cron/1.0" } })
      )
    ).toBe(true);
  });

  it("keeps an unrecognised caller on Martin, but not as a free re-send", () => {
    const opts = noteTestAudience(new Request(CRON_URL));
    expect(opts.onlyEmails).toEqual(["martin.aasa@upthink.ee"]);
    // The bug: this branch used to skip the marker, so every unrecognised
    // run mailed again.
    expect(opts.forceResend).toBe(false);
  });

  it("lets a named test send re-send on purpose", () => {
    const opts = noteTestAudience(new Request(`${CRON_URL}?only=me`));
    expect(opts.forceResend).toBe(true);
  });
});

describe("three Sunday slots, one letter", () => {
  it("sends once even when every slot looks like a manual hit", async () => {
    // Exactly the production shape: no recognised cron header anywhere.
    for (const url of [CRON_URL, `${CRON_URL}?resume=1`, `${CRON_URL}?resume=1`]) {
      await dispatchWeeklyLetters(noteTestAudience(new Request(url)));
    }
    expect(sends).toHaveLength(1);
  });

  it("sends once across the real schedule too", async () => {
    const slot = (url: string) =>
      new Request(url, { headers: { "x-vercel-cron-schedule": "0 4 * * 0" } });
    await dispatchWeeklyLetters(noteTestAudience(slot(CRON_URL)));
    await dispatchWeeklyLetters(noteTestAudience(slot(`${CRON_URL}?resume=1`)));
    await dispatchWeeklyLetters(noteTestAudience(slot(`${CRON_URL}?resume=1`)));
    expect(sends).toHaveLength(1);
  });

  it("claims the recipient before writing, not after sending", async () => {
    await dispatchWeeklyLetters({});
    // The marker is set by the time the mail goes out, so a run racing
    // this one finds the row already taken.
    expect(profiles[0].note_sunday_sent_at).not.toBeNull();
  });

  it("gives the provider a key it can refuse a duplicate on", async () => {
    await dispatchWeeklyLetters({});
    expect(sends[0].idempotencyKey).toBe(
      `sunday-letter:${letterWeekKey()}:${READER}`
    );
  });

  it("lets next Sunday through", async () => {
    await dispatchWeeklyLetters({});
    profiles[0].note_sunday_sent_at = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    await dispatchWeeklyLetters({});
    expect(sends).toHaveLength(2);
  });

  it("puts the claim back when the send fails, so a later slot retries", async () => {
    failNextSend = true;
    const first = await dispatchWeeklyLetters({});
    expect(first.sent).toBe(0);
    expect(profiles[0].note_sunday_sent_at).toBeNull();
    const second = await dispatchWeeklyLetters({});
    expect(second.sent).toBe(1);
  });
});

describe("letterWeekKey", () => {
  it("is the same for every slot of one Sunday", () => {
    expect(letterWeekKey(new Date("2026-08-23T04:00:00Z"))).toBe(
      letterWeekKey(new Date("2026-08-23T04:40:00Z"))
    );
  });

  it("moves on for the next week", () => {
    expect(letterWeekKey(new Date("2026-08-30T04:00:00Z"))).not.toBe(
      letterWeekKey(new Date("2026-08-23T04:00:00Z"))
    );
  });
});
