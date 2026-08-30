/**
 * The Sunday letter has to work whether or not `note_sunday_sent_at` exists.
 *
 * `docs/ZERO_DOWNTIME_MIGRATIONS.md` ships the app before applying the SQL,
 * so there is always a window where this code is live and the column is
 * not. The first version of this feature selected the column
 * unconditionally and returned `ok: false` on any error, which meant that
 * during the window **nobody received a letter at all** -- no partial send,
 * no warning, just a quiet Sunday, for as long as it took someone to run a
 * migration.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Set true to make the database behave as if the column is not there. */
let columnMissing = false;
const selects: string[] = [];
const updates: Array<Record<string, unknown>> = [];
const PROFILES = [
  { id: "u1", email: "a@example.com", display_name: "A", note_sunday_sent_at: null },
  { id: "u2", email: "b@example.com", display_name: "B", note_sunday_sent_at: null },
];

/*
  The reads paginate now (readAll walks .range() a page at a time), so a stub
  that answers only to await is no longer a builder. This one is both: await it
  and you get the page, ask it for a range and you get the same page once and
  nothing after it, which is what ends the walk.
*/
function page<T>(payload: T) {
  const done = Promise.resolve(payload);
  const builder = {
    // The real builder's .order() returns itself; the fake's data is
    // already deterministic, so this is just the chain link.
    order: () => builder,
    range: (from: number) =>
      from === 0 ? done : Promise.resolve({ data: [], error: null }),
    then: (...a: Parameters<Promise<T>["then"]>) => done.then(...a),
    catch: (...a: Parameters<Promise<T>["catch"]>) => done.catch(...a),
    finally: (...a: Parameters<Promise<T>["finally"]>) => done.finally(...a),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = (cols: string) => {
        selects.push(cols);
        const asked = cols.includes("note_sunday_sent_at");
        q.eq = () =>
          page(
            asked && columnMissing
              ? {
                  data: null,
                  error: {
                    code: "42703",
                    message:
                      'column portfell_profiles.note_sunday_sent_at does not exist',
                  },
                }
              : {
                  data: PROFILES.map(({ note_sunday_sent_at, ...rest }) =>
                    asked ? { ...rest, note_sunday_sent_at } : rest
                  ),
                  error: null,
                }
          );
        q.in = () => page({ data: [], error: null });
        q.not = () => page({ data: [], error: null });
        return q;
      };
      q.update = (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { in: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) };
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/telemetry", () => ({ logEvent: () => {} }));

import { dispatchWeeklyLetters, noteTestAudience } from "@/lib/note-cron";

beforeEach(() => {
  columnMissing = false;
  selects.length = 0;
  updates.length = 0;
});

describe("the sent-marker column may not exist yet", () => {
  it("asks for the marker when it is there", async () => {
    await dispatchWeeklyLetters({ onlyEmails: ["a@example.com"] });
    expect(selects[0]).toContain("note_sunday_sent_at");
  });

  it("falls back to a select without the marker rather than giving up", async () => {
    columnMissing = true;
    await dispatchWeeklyLetters({ onlyEmails: ["a@example.com"] });

    // Asked once with the column, then immediately again without it, and
    // the run carried on into its normal batched reads.
    expect(selects[0]).toContain("note_sunday_sent_at");
    expect(selects[1]).not.toContain("note_sunday_sent_at");
    expect(selects[1]).toContain("display_name");
    expect(selects.length).toBeGreaterThan(2);
  });

  it("does not report failure just because the column is absent", async () => {
    columnMissing = true;
    const res = await dispatchWeeklyLetters({ onlyEmails: ["a@example.com"] });
    // The regression: ok:false here meant zero letters for everyone.
    expect(res.ok).toBe(true);
  });

  it("never writes a marker that has nowhere to go", async () => {
    columnMissing = true;
    await dispatchWeeklyLetters({ onlyEmails: ["a@example.com"] });
    expect(
      updates.some((u) => "note_sunday_sent_at" in u)
    ).toBe(false);
  });

  it("stands a resume run down when it cannot tell who was already sent to", async () => {
    /*
     * Sunday fires three times: 04:00 plus two resume slots. With no marker
     * there is no way to know who already has the letter, so sending from
     * all three would put the same mail in the same inbox three times --
     * worse than the gap the resume slots exist to close.
     */
    columnMissing = true;
    const res = await dispatchWeeklyLetters({
      onlyEmails: ["a@example.com"],
      isResumeRun: true,
    });
    expect(res.ok).toBe(true);
    expect(res.sent).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("lets resume runs work normally once the column exists", async () => {
    columnMissing = false;
    const res = await dispatchWeeklyLetters({
      onlyEmails: ["a@example.com"],
      isResumeRun: true,
    });
    expect(res.ok).toBe(true);
  });
});

describe("noteTestAudience", () => {
  const req = (url: string, cron = true) =>
    new Request(url, { headers: cron ? { "x-vercel-cron": "1" } : {} });

  it("marks the later Sunday slots as resume runs", () => {
    expect(
      noteTestAudience(req("https://upsidelab.app/api/cron/sunday-note?resume=1"))
        .isResumeRun
    ).toBe(true);
  });

  it("leaves the first slot as a normal run", () => {
    expect(
      noteTestAudience(req("https://upsidelab.app/api/cron/sunday-note")).isResumeRun
    ).toBe(false);
  });
});
