"use client";

import { useEffect } from "react";

import { watchArrivals } from "@/lib/play-in-view";

/**
 * Holds every chart's arrival animation until a reader can see it.
 * Mounted once, beside `RimLight`; the whole account is in
 * `play-in-view.ts`.
 */
export function ArrivalWatcher() {
  useEffect(() => watchArrivals(), []);
  return null;
}
