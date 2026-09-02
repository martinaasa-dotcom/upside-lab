import { describe, expect, it } from "vitest";
import { pruneOldSnapshots, saveBookSnapshot } from "@/lib/book-snapshot";

/*
  A saved copy belongs to somebody, and the retention window has to know it.

  portfell_book_snapshots was built when a snapshot was the whole project,
  and the nightly row still is. Two later kinds are per person: a manual row
  is one reader pressing Save, and a pre_delete row is the copy that makes
  deleting a portfolio recoverable. The prune counted all three project-wide,
  so twenty manual rows in total meant the twenty-first, whoever made it,
  deleted the oldest, whoever owned it.

  Nobody had to attack this. The nightly cron ran the same global prune, so
  the moment the product held more than twenty manual rows between everybody
  it began deleting the oldest every night, silently, and the reader who
  saved it would find out only on the day they went looking for an undo.

  These tests are the floor. Each drives the real function against a stub
  that answers like PostgREST, and each fails on the old global prune.
*/

type Row = { id: string; created_at: string; owner_id: string | null };

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-02T00:00:00.000Z");

function makeRows(owner: string, kind: string, count: number, from = 0): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${kind}-${owner}-${i + from}`,
    created_at: new Date(NOW - (i + from) * DAY).toISOString(),
    owner_id: owner,
  }));
}

/** Enough of PostgREST to answer the prune's three reads and its delete. */
function stubClient(rowsByKind: Record<string, Row[]>) {
  const deleted: string[] = [];
  const client = {
    from() {
      let kind = "";
      let owner: string | null | undefined;
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => Promise.resolve({ data: rowsFor(), error: null }),
        eq(col: string, val: string) {
          if (col === "kind") kind = val;
          if (col === "owner_id") owner = val;
          return q;
        },
        delete: () => q,
        in(_col: string, ids: string[]) {
          deleted.push(...ids);
          return Promise.resolve({ data: null, error: null });
        },
      };
      function rowsFor() {
        const all = rowsByKind[kind] ?? [];
        return owner === undefined ? all : all.filter((r) => r.owner_id === owner);
      }
      // `order` resolves the read, so it must see the eq() calls first: the
      // query object is returned by each and awaited only at the end.
      return q;
    },
    deleted,
  };
  return client;
}

describe("a manual save is counted inside its own owner's window", () => {
  it("does not drop one person's saves because another person has many", async () => {
    // Ada is at the cap on her own. Ben has one, made before all of hers.
    const rows = [...makeRows("ada", "manual", 20), ...makeRows("ben", "manual", 1, 40)];
    const client = stubClient({ manual: rows, pre_delete: [], nightly: [] });
    await pruneOldSnapshots(client as never);
    expect(
      client.deleted,
      `Ben's only saved copy was deleted because Ada had reached the cap. ` +
        `The window for a per-person kind is counted inside one owner, or ` +
        `anybody's saves push out everybody's.`
    ).toEqual([]);
  });

  it("still trims a single owner past their own cap, oldest first", async () => {
    const client = stubClient({
      manual: makeRows("ada", "manual", 22),
      pre_delete: [],
      nightly: [],
    });
    await pruneOldSnapshots(client as never);
    expect(client.deleted).toEqual(["manual-ada-20", "manual-ada-21"]);
  });

  it("leaves the nightly window project-wide, because a nightly row is the project", async () => {
    const nightly = Array.from({ length: 16 }, (_, i) => ({
      id: `n${i}`,
      created_at: new Date(NOW - i * DAY).toISOString(),
      owner_id: null,
    }));
    const client = stubClient({ nightly, manual: [], pre_delete: [] });
    await pruneOldSnapshots(client as never);
    expect(client.deleted).toEqual(["n14", "n15"]);
  });
});

describe("a save records whose it is", () => {
  function insertSpy() {
    const seen: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        insert(row: Record<string, unknown>) {
          seen.push(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "x", ...row }, error: null }),
            }),
          };
        },
      }),
      seen,
    };
    return client;
  }

  it("writes the owner on a per-person kind", async () => {
    const client = insertSpy();
    await saveBookSnapshot(
      client as never,
      "manual",
      "Manual snapshot",
      { portfolios: [], holdings: [] },
      "ada"
    );
    expect(client.seen[0]!.owner_id).toBe("ada");
  });

  it("leaves the owner null on a nightly row even if one is passed", async () => {
    const client = insertSpy();
    await saveBookSnapshot(
      client as never,
      "nightly",
      "Nightly",
      { portfolios: [], holdings: [] },
      "ada"
    );
    expect(
      client.seen[0]!.owner_id,
      `A nightly row is the whole project and must stay ownerless, or it ` +
        `would be counted inside one person's window.`
    ).toBeNull();
  });
});

describe("the request path prunes only the caller", () => {
  it("narrows the read to one owner when given one", async () => {
    const rows = [...makeRows("ada", "manual", 22), ...makeRows("ben", "manual", 22)];
    const client = stubClient({ manual: rows, pre_delete: [], nightly: [] });
    await pruneOldSnapshots(client as never, "ada");
    expect(client.deleted.every((id) => id.includes("ada"))).toBe(true);
    expect(client.deleted).toHaveLength(2);
  });
});

describe("guards", () => {
  it("deletes nothing when every window has room", async () => {
    const client = stubClient({
      manual: makeRows("ada", "manual", 3),
      pre_delete: makeRows("ada", "pre_delete", 3),
      nightly: [],
    });
    await pruneOldSnapshots(client as never);
    expect(client.deleted).toEqual([]);
  });
});
