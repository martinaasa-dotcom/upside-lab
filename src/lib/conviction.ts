/** Per-ticker conviction + thesis (localStorage, mirrored to IndexedDB). */
import { persistLabSnapshot } from "@/lib/offline/snapshots";

export type ConvictionLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Most a thesis note may be, in characters. The editor and the Lab save
 * route read the same number, because a note the editor accepts and the
 * server refuses is a note that quietly never syncs. Margus is only ever
 * shown the first 400 characters of one, so nothing past there reaches
 * the model whatever the note says.
 */
export const CONVICTION_THESIS_MAX_CHARS = 2000;

export type PulseStamp = {
  at: string;
  verdict: string;
  line: string;
  action?: string;
  thesisStatus?: string;
};

export type ConvictionEntry = {
  level: ConvictionLevel;
  thesis: string;
  updatedAt: string;
  stamps?: PulseStamp[];
};

export type ConvictionMap = Record<string, ConvictionEntry>;

const KEY = "upside-conviction-v1";

export function loadConvictionMap(): ConvictionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ConvictionMap;
  } catch {
    return {};
  }
}

export function saveConvictionMap(map: ConvictionMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    persistLabSnapshot(map);
  } catch {
    /* ignore */
  }
}

export function setConviction(
  map: ConvictionMap,
  ticker: string,
  patch: Partial<ConvictionEntry>
): ConvictionMap {
  const key = ticker.toUpperCase();
  const prev = map[key] ?? {
    level: 3 as ConvictionLevel,
    thesis: "",
    updatedAt: new Date().toISOString(),
  };
  const next: ConvictionMap = {
    ...map,
    [key]: {
      level: (patch.level ?? prev.level) as ConvictionLevel,
      thesis: patch.thesis ?? prev.thesis,
      stamps: patch.stamps ?? prev.stamps,
      updatedAt: new Date().toISOString(),
    },
  };
  saveConvictionMap(next);
  return next;
}

export function addPulseStamp(
  map: ConvictionMap,
  ticker: string,
  stamp: PulseStamp
): ConvictionMap {
  const key = ticker.toUpperCase();
  const prev = map[key] ?? {
    level: 3 as ConvictionLevel,
    thesis: "",
    updatedAt: stamp.at,
    stamps: [],
  };
  const stamps = [stamp, ...(prev.stamps ?? [])].slice(0, 8);
  const next: ConvictionMap = {
    ...map,
    [key]: { ...prev, stamps, updatedAt: stamp.at },
  };
  saveConvictionMap(next);
  return next;
}
