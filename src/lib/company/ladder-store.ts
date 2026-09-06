/**
 * Where one reader's price-plan edits live in the browser.
 *
 * The server copy is the real one, on `portfell_lab_state` beside the
 * conviction notes, because a plan is a decision about a company rather
 * than a setting on a device: somebody who set their levels on a laptop
 * and then opens their phone in a falling market has to find the same
 * levels there. This is the mirror, so a plan is on screen before the
 * round trip lands and survives a browser with no session yet.
 *
 * Edits are multiples of the anchor, never prices, for the reason the
 * migration gives: the anchor moves as the estimates move, and a reader
 * who decided to trim a fifth above the estimate meant that rather than a
 * dollar figure frozen on the afternoon they typed it.
 */
import { sanitizeLadders } from "@/lib/lab-bundle";
import type {
  LadderBandId,
  LadderOverride,
  LadderOverrides,
} from "@/lib/company/plan-ladder";

const KEY = "upside-price-plans-v1";

export function loadLocalLadders(): LadderOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    return sanitizeLadders(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveLocalLadders(ladders: LadderOverrides) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sanitizeLadders(ladders)));
  } catch {
    /* quota / private mode */
  }
}

/**
 * One level moved, or put back.
 *
 * A null price is "back to the worked-out level", which deletes the edit
 * rather than storing today's computed number: storing it would freeze a
 * level that is meant to follow the estimates, and the reader would never
 * be told it had stopped moving.
 */
export function withEdge(
  ladders: LadderOverrides,
  ticker: string,
  id: LadderBandId,
  ratio: number | null
): LadderOverrides {
  const key = ticker.trim().toUpperCase();
  const before: LadderOverride = ladders[key] ?? {};
  const edges = { ...(before.edges ?? {}) };
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
    delete edges[id];
  } else {
    edges[id] = ratio;
  }
  const next: LadderOverrides = { ...ladders };
  if (Object.keys(edges).length === 0 && before.anchor == null) {
    delete next[key];
  } else {
    next[key] = { ...before, edges };
  }
  return next;
}

/** Every level on one name back to the arithmetic. */
export function withoutLadder(
  ladders: LadderOverrides,
  ticker: string
): LadderOverrides {
  const next = { ...ladders };
  delete next[ticker.trim().toUpperCase()];
  return next;
}

/**
 * Push the plans to the account.
 *
 * Only the plans: the Lab save is a partial one by design, so sending a
 * ladder must not blank somebody's conviction notes on its way past. It
 * rides the offline queue for the same reason the watchlist does, since a
 * level typed on a train is still a decision.
 */
export async function pushLadders(ladders: LadderOverrides) {
  try {
    const { fetchOrQueue } = await import("@/lib/offline/queued-fetch");
    await fetchOrQueue(
      "/api/lab",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ladders }),
      },
      { kind: "preference" }
    );
  } catch {
    /* the local copy is still saved, and the next save retries */
  }
}
