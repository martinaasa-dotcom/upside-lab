import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The digest run, end to end against a builder-shaped double.

  error-digest.test.ts pins the pure parts (folding, grouping, the send
  decision); this file drives runErrorDigest itself, because the wiring
  is where the quiet mistakes live: the two windows must actually filter
  by time, the reads must page, a send must carry the per-day idempotency
  key so a double-fired schedule mails once, and a deployment with no
  Resend key must report emailed: false rather than pretending.

  The double follows the house pattern from the weekly-letter tests: a
  chainable builder that honors the filters the real query applies, so
  the test fails if the production code stops applying them.
*/

const NOW = new Date("2026-08-30T05:30:00Z");
const HOUR = 60 * 60 * 1000;

type Row = {
  source: string;
  message: string;
  path: string | null;
  created_at: string;
};

let rows: Row[] = [];
let emailConfigured = true;
const sent: Array<{ to: string; subject: string; idempotencyKey?: string }> =
  [];

function at(hoursAgo: number): string {
  return new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();
}

function builder() {
  let gte: string | null = null;
  let lt: string | null = null;
  let window: [number, number] | null = null;
  const chain = {
    select: () => chain,
    gte: (_col: string, v: string) => {
      gte = v;
      return chain;
    },
    lt: (_col: string, v: string) => {
      lt = v;
      return chain;
    },
    order: () => chain,
    range: (from: number, to: number) => {
      window = [from, to];
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => {
      const filtered = rows.filter(
        (r) =>
          (gte == null || r.created_at >= gte) &&
          (lt == null || r.created_at < lt)
      );
      const page = window ? filtered.slice(window[0], window[1] + 1) : filtered;
      return Promise.resolve(resolve({ data: page, error: null }));
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => ({ from: () => builder() }),
}));
vi.mock("@/lib/send-note", () => ({
  noteEmailConfigured: () => emailConfigured,
  sendNoteEmail: async (input: {
    to: string;
    subject: string;
    idempotencyKey?: string;
  }) => {
    sent.push({
      to: input.to,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
    });
    return true;
  },
}));

const { runErrorDigest } = await import("@/lib/error-digest");
const { SUPERADMIN_NOTE_EMAIL } = await import("@/lib/auth/superadmin");

beforeEach(() => {
  rows = [];
  sent.length = 0;
  emailConfigured = true;
});

describe("runErrorDigest", () => {
  it("mails once, keyed to the day, when a new class appears", async () => {
    rows = [
      // Yesterday's known trouble, in both windows.
      { source: "server", message: "quote fetch failed after 3 tries", path: "/api/quotes", created_at: at(30) },
      { source: "server", message: "quote fetch failed after 9 tries", path: "/api/quotes", created_at: at(10) },
      // The new fault, today only.
      { source: "server", message: "snapshot write failed", path: "/api/cron/snapshot", created_at: at(2) },
    ];
    const result = await runErrorDigest(NOW);
    expect(result).toMatchObject({ ok: true, total: 2, newClasses: 1, emailed: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(SUPERADMIN_NOTE_EMAIL);
    expect(sent[0].subject).toContain("1 new kind");
    // The platform documents that a schedule can fire twice; the key is
    // what turns the second firing into no second mail.
    expect(sent[0].idempotencyKey).toBe("error-digest:2026-08-30");
  });

  it("a quiet day reads both windows and sends nothing", async () => {
    rows = [
      { source: "server", message: "quote fetch failed after 3 tries", path: null, created_at: at(30) },
      { source: "server", message: "quote fetch failed after 5 tries", path: null, created_at: at(3) },
    ];
    const result = await runErrorDigest(NOW);
    expect(result).toMatchObject({ ok: true, total: 1, newClasses: 0, emailed: false });
    expect(sent).toHaveLength(0);
  });

  it("rows older than the two windows are not read at all", async () => {
    rows = [
      // A week old: outside both windows, so today it is a new class only
      // if the window filter leaks.
      { source: "server", message: "ancient fault", path: null, created_at: at(24 * 7) },
      { source: "server", message: "ancient fault", path: null, created_at: at(2) },
    ];
    const result = await runErrorDigest(NOW);
    // The fault IS new against yesterday, because the week-old row is
    // beyond the comparison window; one row, one new class.
    expect(result).toMatchObject({ total: 1, newClasses: 1 });
  });

  it("with no mail key it decides but does not pretend to send", async () => {
    emailConfigured = false;
    rows = [
      { source: "server", message: "snapshot write failed", path: null, created_at: at(2) },
    ];
    const result = await runErrorDigest(NOW);
    expect(result).toMatchObject({ ok: true, newClasses: 1, emailed: false });
    expect(sent).toHaveLength(0);
  });
});
