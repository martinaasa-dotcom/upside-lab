import { describe, expect, it } from "vitest";
import { readAll } from "@/lib/supabase/read-all";

/*
  Paging, and the one property that matters about it: what comes back is
  everything, however many pages that took.

  PostgREST returns at most db-max-rows and says nothing about having done so,
  which is why every read this is used by was quietly wrong at scale rather
  than loudly broken. The tests below are about the loop, not about Supabase:
  the builder is a stand-in that hands out slices of a list.
*/

function rowsIn(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ n: i }));
  const asked: Array<[number, number]> = [];

  return {
    asked,
    build: () => ({
      range: async (from: number, to: number) => {
        asked.push([from, to]);
        return { data: all.slice(from, to + 1), error: null };
      },
    }),
  };
}

describe("readAll", () => {
  it("asks once when the first page is not full", async () => {
    const source = rowsIn(12);

    const rows = await readAll(source.build);

    expect(rows).toHaveLength(12);
    expect(source.asked).toEqual([[0, 499]]);
  });

  it("keeps going until a page comes back short", async () => {
    const source = rowsIn(1300);

    const rows = await readAll(source.build);

    expect(rows).toHaveLength(1300);
    expect(source.asked).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  /*
    The case the page size exists for. A loop asking for exactly as many rows
    as it is allowed cannot tell a full page from a truncated one, so it would
    stop at the cap and report a complete answer.
  */
  it("does not stop at a thousand", async () => {
    const source = rowsIn(2600);

    const rows = await readAll(source.build);

    expect(rows).toHaveLength(2600);
  });

  it("asks one more time when the last page is exactly full", async () => {
    const source = rowsIn(1000);

    const rows = await readAll(source.build);

    expect(rows).toHaveLength(1000);
    // Two full pages tell it nothing, so it asks a third and gets nothing.
    expect(source.asked).toHaveLength(3);
  });

  it("returns nothing at all when there is nothing", async () => {
    const source = rowsIn(0);

    expect(await readAll(source.build)).toEqual([]);
  });

  it("hands back what it read when a page fails", async () => {
    let call = 0;
    const rows = await readAll<{ n: number }>(() => ({
      range: async (from: number, to: number) => {
        call += 1;
        if (call > 1) return { data: null, error: new Error("gone") };
        return {
          data: Array.from({ length: to - from + 1 }, (_, i) => ({ n: from + i })),
          error: null,
        };
      },
    }));

    // The room draws with less rather than not at all, which is how every
    // caller already treats a failed read.
    expect(rows).toHaveLength(500);
  });

  /*
    And the other half of that choice. A snapshot missing most of its rows and
    looking exactly like a good one is worse than a backup that failed and
    said so, so captureBookPayload asks for the loud version.
  */
  it("raises instead, when the caller says a short answer is worse", async () => {
    await expect(
      readAll<{ n: number }>(
        () => ({
          range: async () => ({ data: null, error: new Error("gone") }),
        }),
        "throw"
      )
    ).rejects.toThrow("gone");
  });

  it("raises a real Error even when the driver hands back a plain object", async () => {
    await expect(
      readAll<{ n: number }>(
        () => ({
          range: async () => ({ data: null, error: { message: "no such column" } }),
        }),
        "throw"
      )
    ).rejects.toThrow("no such column");
  });
});
