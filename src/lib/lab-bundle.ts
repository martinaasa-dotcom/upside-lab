import type { ConvictionMap } from "@/lib/conviction";
import type { LadderOverride, LadderOverrides } from "@/lib/company/plan-ladder";

/**
 * Per-owner Lab state. Conviction is the thesis note per ticker; the
 * watchlist rides along so the Sunday email can suggest names the reader
 * is watching but does not own yet.
 */
export type LabBundle = {
  conviction: ConvictionMap;
  watchlist: string[];
  /** The reader's own price-plan edits, per ticker. */
  ladders: LadderOverrides;
  updatedAt?: string;
};

export function emptyLabBundle(): LabBundle {
  return { conviction: {}, watchlist: [], ladders: {} };
}

/** Same shape the browser's watchlist helper enforces. */
export function sanitizeWatchlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((t) => String(t).trim().toUpperCase())
        .filter((t) => /^[A-Z0-9.=^-]{1,12}$/.test(t))
    ),
  ].slice(0, 40);
}

/**
 * One reader's price-plan edits, cleaned on the way in and on the way out.
 *
 * Everything here is a multiple of that ladder's anchor rather than a
 * price, so the bounds are bounds on a multiple: nothing below a tenth of
 * the anchor or above five times it, which is far wider than any plan a
 * person would draw and still narrow enough that a corrupt row cannot put
 * a level at a nonsense price. A value that fails is dropped rather than
 * clamped, because a clamped level is a number the reader never chose
 * sitting in a plan they think is theirs.
 */
const EDGE_IDS = [
  "trim-most",
  "trim-some",
  "hold",
  "starter",
  "full",
  "full-aggressive",
  "exit",
] as const;

function edgeRatio(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0.1 || n > 5) return null;
  return n;
}

export function sanitizeLadders(raw: unknown): LadderOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: LadderOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const ticker = String(key).trim().toUpperCase();
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(ticker)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const edges: LadderOverride["edges"] = {};
    const from = row.edges;
    if (from && typeof from === "object" && !Array.isArray(from)) {
      for (const id of EDGE_IDS) {
        const ratio = edgeRatio((from as Record<string, unknown>)[id]);
        if (ratio !== null) edges[id] = ratio;
      }
    }
    const anchor =
      typeof row.anchor === "number" && Number.isFinite(row.anchor) && row.anchor > 0
        ? row.anchor
        : null;
    if (Object.keys(edges).length === 0 && anchor === null) continue;
    out[ticker] = anchor === null ? { edges } : { edges, anchor };
    // A plan per name, and a sane ceiling on how many rows one row of the
    // table may carry, for the same reason the watchlist has one.
    if (Object.keys(out).length >= 200) break;
  }
  return out;
}
