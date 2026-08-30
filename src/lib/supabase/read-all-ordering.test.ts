import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  A paged read must say what order its pages come in, or the pages can
  shuffle under it.

  `readAll` walks `.range()` windows, and each window is its own SQL
  statement. Postgres makes no promise about the order of an unordered
  scan between statements -- synchronized and parallel sequential scans
  genuinely start at different points run to run -- so two unordered
  pages can overlap or gap, and the walk hands back duplicated or missing
  rows with nothing failing. That is the same silent wrongness the
  db-max-rows work fixed, one layer down, and it only shows itself past
  500 rows, which is exactly when these reads matter most.

  So the floor: every `readAll` call site carries `.order(...)` on its
  builder. What the text cannot check is written here instead and
  enforced by review: the order must end on a unique column (the primary
  key), because a non-unique order (`sort_order`, `created_at`) has the
  same hole at every tie that straddles a page boundary. Call sites
  order by the key as the final term.

  The scan is textual and window-based, so a builder defined far from
  its `readAll` call is beyond it; keep builders beside their calls, the
  way book-snapshot.ts does.
*/

const ROOT = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("every paged read declares its order", () => {
  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const source = readFileSync(file, "utf8");
    // Only the Supabase pager; a local helper that happens to share the
    // name (chat-history's localStorage readAll) is not a paged query.
    if (!source.includes('from "@/lib/supabase/read-all"')) continue;
    for (const m of source.matchAll(/\breadAll[<(]/g)) {
      const at = m.index ?? 0;
      const before = source.slice(Math.max(0, at - 900), at);
      const after = source.slice(at, at + 900);
      if (!before.includes(".order(") && !after.includes(".order(")) {
        const line = source.slice(0, at).split("\n").length;
        offenders.push(`${path.relative(ROOT, file).replace(/\\/g, "/")}:${line}`);
      }
    }
  }

  it("no readAll call pages an unordered query", () => {
    expect(
      offenders,
      "These readAll call sites page a query with no .order(), so their " +
        "pages can overlap or gap between statements. Order by the " +
        "table's primary key as the final term: " +
        offenders.join(", ")
    ).toEqual([]);
  });
});
