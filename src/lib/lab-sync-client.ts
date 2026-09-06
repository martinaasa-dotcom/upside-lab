import { isAbortError } from "@/lib/abort";
import { emptyLabBundle, type LabBundle } from "@/lib/lab-bundle";
import { saveConvictionMap } from "@/lib/conviction";
import { saveWatchlist } from "@/lib/watchlist";
import { saveLocalLadders } from "@/lib/company/ladder-store";
import { fetchOrQueue } from "@/lib/offline/queued-fetch";

const LAB_SAVE_FAILED =
  "Couldn't save your Lab notes. They're still on this device.";

export type LabFetchResult = {
  source: "supabase" | "local";
  bundle: LabBundle;
};

export function mirrorLabLocal(bundle: LabBundle) {
  saveConvictionMap(bundle.conviction ?? {});
  if (Array.isArray(bundle.watchlist)) {
    saveWatchlist(bundle.watchlist, { sync: false });
  }
  saveLocalLadders(bundle.ladders ?? {});
}

export async function fetchLabBundle(
  signal?: AbortSignal
): Promise<LabFetchResult> {
  try {
    const res = await fetch("/api/lab", { cache: "no-store", signal });
    if (!res.ok) {
      return { source: "local", bundle: emptyLabBundle() };
    }
    const data = (await res.json()) as {
      source?: string;
      bundle?: LabBundle;
    };
    const bundle = data.bundle ?? emptyLabBundle();
    if (data.source === "supabase") {
      mirrorLabLocal(bundle);
      return { source: "supabase", bundle };
    }
  } catch (e) {
    if (isAbortError(e) || signal?.aborted) {
      return { source: "local", bundle: emptyLabBundle() };
    }
    /* fall through */
  }
  return { source: "local", bundle: emptyLabBundle() };
}

export async function pushLabBundle(
  bundle: LabBundle
): Promise<{ ok: boolean; error?: string }> {
  mirrorLabLocal(bundle);
  try {
    const res = await fetchOrQueue(
      "/api/lab",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conviction: bundle.conviction,
          watchlist: bundle.watchlist ?? [],
          ladders: bundle.ladders ?? {},
        }),
      },
      { kind: "preference" }
    );
    if (res.status === 400) {
      return { ok: true };
    }
    if (!res.ok) {
      // The person gets the plain sentence; the cause goes to the console so a
      // failing save is actually diagnosable instead of silently generic.
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn("[lab] save rejected", res.status, data.error ?? "no detail");
      return { ok: false, error: LAB_SAVE_FAILED };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[lab] save failed", e);
    return { ok: false, error: LAB_SAVE_FAILED };
  }
}
