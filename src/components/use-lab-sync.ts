"use client";

import { emptyLabBundle, type LabBundle } from "@/lib/lab-bundle";
import { loadConvictionMap, onConvictionChanged } from "@/lib/conviction";
import { loadWatchlist } from "@/lib/watchlist";
import { loadLocalLadders } from "@/lib/company/ladder-store";
import {
  fetchLabBundle,
  mirrorLabLocal,
  pushLabBundle,
} from "@/lib/lab-sync-client";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useRef, useState } from "react";

/** Conviction is the only Lab field that round-trips to Supabase. */
export function useLabSync() {
  const { push: toast } = useToast();
  const [labBundle, setLabBundle] = useState<LabBundle>(() => emptyLabBundle());
  const [labReady, setLabReady] = useState(false);
  const labDirtyRef = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
      const local: LabBundle = {
        conviction: loadConvictionMap(),
        watchlist: loadWatchlist(),
        ladders: loadLocalLadders(),
      };
      const remote = await fetchLabBundle(ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (remote.source === "supabase") {
        const remoteEmpty =
          Object.keys(remote.bundle.conviction ?? {}).length === 0;
        const localHas = Object.keys(local.conviction ?? {}).length > 0;
        if (remoteEmpty && localHas) {
          // Show it (a genuinely new signup with pre-auth local notes should
          // see them), but do NOT auto-mark dirty. `localHas` only means
          // *this browser* has conviction notes cached — on a shared or
          // borrowed device those can belong to whoever used the app here
          // before this account existed. Auto-pushing them, as this used to
          // do, would silently write a stranger's private thesis notes into
          // this account's own portfell_lab_state row. Only a real edit
          // (patchLab) should ever mark the bundle dirty and trigger a save.
          setLabBundle(local);
        } else {
          const merged: LabBundle = {
            conviction: remoteEmpty
              ? local.conviction
              : remote.bundle.conviction,
            watchlist:
              (remote.bundle.watchlist ?? []).length === 0
                ? local.watchlist
                : remote.bundle.watchlist,
            /*
              The price plans, and the same rule the watchlist follows: the
              server wins unless it has nothing, because a browser that has
              been offline holds a stale copy and a plan is per person
              rather than per device.
            */
            ladders:
              Object.keys(remote.bundle.ladders ?? {}).length === 0
                ? local.ladders
                : remote.bundle.ladders,
            updatedAt: remote.bundle.updatedAt,
          };
          setLabBundle(merged);
          mirrorLabLocal(merged);
        }
      } else {
        setLabBundle(local);
      }
      setLabReady(true);
      } catch {
        if (ctrl.signal.aborted) return;
        setLabReady(true);
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, []);

  /*
    A thesis written in the Research room, which holds its own copy and
    saves the notes on their own. Without this the book's next save of
    anything else in the bundle would push a conviction map from before
    that edit and quietly revert it. It never marks the bundle dirty:
    the room that made the edit has already saved it.
  */
  useEffect(
    () =>
      onConvictionChanged((conviction) => {
        setLabBundle((prev) =>
          prev.conviction === conviction ? prev : { ...prev, conviction }
        );
      }),
    []
  );

  const pushGenRef = useRef(0);
  useEffect(() => {
    if (!labReady || !labDirtyRef.current) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      labDirtyRef.current = false;
      const gen = ++pushGenRef.current;
      void pushLabBundle(labBundle).then((r) => {
        if (cancelled || gen !== pushGenRef.current) return;
        if (!r.ok && r.error) toast(r.error, "error");
      }).catch(() => {
        /* pushLabBundle already swallows network errors */
      });
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [labBundle, labReady, toast]);

  function patchLab(patch: Partial<LabBundle>) {
    labDirtyRef.current = true;
    setLabBundle((prev) => ({ ...prev, ...patch }));
  }

  return { labBundle, labReady, patchLab };
}
