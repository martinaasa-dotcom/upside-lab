/**
 * The covered-call route runs on the service role, so the ownership check
 * in code is the only thing between a caller and another portfolio's calls.
 * These hold that it is asked on every verb, against the portfolio stored on
 * the row rather than one the request names.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  owned: new Set<string>(),
  writes: [] as { op: string; payload?: unknown }[],
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/portfolio-write-context", () => ({
  loadPortfolioWriteContext: async (_s: unknown, _u: string, pid: string | null) =>
    pid && db.owned.has(pid)
      ? { ok: true, context: { portfolioId: pid } }
      : { ok: false, status: 403, error: "You can only edit portfolios you own" },
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: NextRequest) => Promise<Response>) => h,
}));

function query() {
  const filters: Record<string, unknown> = {};
  let op = "select";
  let payload: unknown = null;
  let head = false;
  const match = () =>
    db.rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
  const q = {
    select: (_c?: string, opts?: { head?: boolean }) => {
      if (opts?.head) head = true;
      return q;
    },
    insert: (p: Record<string, unknown>) => {
      op = "insert";
      payload = p;
      return q;
    },
    update: (p: unknown) => {
      op = "update";
      payload = p;
      return q;
    },
    delete: () => {
      op = "delete";
      return q;
    },
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return q;
    },
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    single: async () => {
      db.writes.push({ op, payload });
      if (op === "insert") {
        const row = { id: "new", ...(payload as object) };
        db.rows.push(row);
        return { data: row, error: null };
      }
      const hit = match()[0];
      return { data: hit ? { ...hit, ...(payload as object) } : null, error: null };
    },
    then: (resolve: (v: unknown) => void) => {
      if (op === "delete") {
        db.writes.push({ op });
        db.rows = db.rows.filter((r) => !match().includes(r));
        return resolve({ error: null });
      }
      if (head) return resolve({ count: match().length, error: null });
      return resolve({ data: match(), error: null });
    },
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => ({ from: () => query() }),
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/covered-calls/route";

const call = {
  ticker: "NVDA",
  status: "sold",
  strike: 200,
  expiry: "2026-10-16",
  contracts: 1,
  premium: 3.2,
};

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`https://upsidelab.app${url}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://upsidelab.app" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  db.rows = [
    { id: "theirs", portfolio_id: "p-other", ...call },
    { id: "mine", portfolio_id: "p-mine", ...call },
  ];
  db.owned = new Set(["p-mine"]);
  db.writes = [];
});

describe("/api/covered-calls", () => {
  it("lists only a portfolio the caller owns", async () => {
    const ok = await GET(req("GET", "/api/covered-calls?portfolio_id=p-mine"));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { calls: { id: string }[] };
    expect(body.calls.map((c) => c.id)).toEqual(["mine"]);
    const no = await GET(req("GET", "/api/covered-calls?portfolio_id=p-other"));
    expect(no.status).toBe(403);
  });

  it("adds a call to the caller's portfolio and refuses anybody else's", async () => {
    expect((await POST(req("POST", "/api/covered-calls", { ...call, portfolio_id: "p-mine" }))).status).toBe(200);
    expect((await POST(req("POST", "/api/covered-calls", { ...call, portfolio_id: "p-other" }))).status).toBe(403);
  });

  it("validates before it writes", async () => {
    const res = await POST(
      req("POST", "/api/covered-calls", { ...call, premium: null, portfolio_id: "p-mine" })
    );
    expect(res.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it("authorizes an edit and a removal by the row's own portfolio", async () => {
    // The body names a portfolio the caller owns; the row is somebody else's.
    const edit = await PATCH(
      req("PATCH", "/api/covered-calls", { ...call, id: "theirs", portfolio_id: "p-mine" })
    );
    expect(edit.status).toBe(403);
    const del = await DELETE(req("DELETE", "/api/covered-calls?id=theirs"));
    expect(del.status).toBe(403);
    expect(db.rows.some((r) => r.id === "theirs")).toBe(true);

    expect((await DELETE(req("DELETE", "/api/covered-calls?id=mine"))).status).toBe(200);
    expect(db.rows.some((r) => r.id === "mine")).toBe(false);
  });
});
