"use client";

/**
 * The house account's own forecast, fetched once and shared by every
 * surface that draws a price ladder: the holdings page, Home's list of
 * names that reached a level, the alerts, and Circle's pooled map.
 *
 * One request per mount rather than one per surface, since it is the
 * same small, CDN-cached answer everywhere it is read
 * (`/api/forecast/house-defaults`).
 */
import { useEffect, useState } from "react";
import type { HouseForecastDefaults } from "@/app/api/forecast/house-defaults/route";

const EMPTY: HouseForecastDefaults = {
  eoyPrices: {},
  eoySources: {},
  ladders: {},
};

export function useHouseForecastDefaults(): HouseForecastDefaults {
  const [defaults, setDefaults] = useState<HouseForecastDefaults>(EMPTY);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/forecast/house-defaults", {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as HouseForecastDefaults;
        if (!ctrl.signal.aborted) setDefaults(data);
      } catch {
        /* the fallback stays the plain per-name default */
      }
    })();
    return () => ctrl.abort();
  }, []);

  return defaults;
}
