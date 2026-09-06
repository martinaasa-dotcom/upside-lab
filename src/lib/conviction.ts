/**
 * Per-ticker Pulse history (localStorage, mirrored to IndexedDB).
 *
 * This map used to carry two things the reader typed: a written reason for
 * owning a company and a one-to-five score for how sure they were. Both are
 * gone, along with every screen that asked for them and every prompt that
 * read them back. What is left is the Pulse stamp trail, which is this
 * app's own record of what it told the reader and is what the Sunday
 * letter's suggestions are built from.
 *
 * `loadConvictionMap` drops anything else it finds, so a browser holding a
 * note written before the removal stops sending it anywhere the moment the
 * map is next saved.
 */
import { persistLabSnapshot } from "@/lib/offline/snapshots";

export type PulseStamp = {
  at: string;
  verdict: string;
  line: string;
  action?: string;
  thesisStatus?: string;
};

export type ConvictionEntry = {
  updatedAt: string;
  stamps?: PulseStamp[];
};

export type ConvictionMap = Record<string, ConvictionEntry>;

const KEY = "upside-conviction-v1";

/** Keeps the stamp trail and the timestamp, and nothing else. */
function cleanEntry(raw: unknown): ConvictionEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<ConvictionEntry>;
  const stamps = Array.isArray(entry.stamps) ? entry.stamps : undefined;
  return {
    updatedAt:
      typeof entry.updatedAt === "string"
        ? entry.updatedAt
        : new Date().toISOString(),
    ...(stamps ? { stamps } : {}),
  };
}

export function loadConvictionMap(): ConvictionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ConvictionMap = {};
    for (const [ticker, value] of Object.entries(parsed ?? {})) {
      const entry = cleanEntry(value);
      if (entry) out[ticker] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveConvictionMap(map: ConvictionMap) {
  if (typeof window === "undefined") return;
  try {
    const clean: ConvictionMap = {};
    for (const [ticker, value] of Object.entries(map ?? {})) {
      const entry = cleanEntry(value);
      if (entry) clean[ticker] = entry;
    }
    localStorage.setItem(KEY, JSON.stringify(clean));
    persistLabSnapshot(clean);
  } catch {
    /* ignore */
  }
}

export function addPulseStamp(
  map: ConvictionMap,
  ticker: string,
  stamp: PulseStamp
): ConvictionMap {
  const key = ticker.toUpperCase();
  const prev = map[key] ?? { updatedAt: stamp.at, stamps: [] };
  const stamps = [stamp, ...(prev.stamps ?? [])].slice(0, 8);
  const next: ConvictionMap = {
    ...map,
    [key]: { ...prev, stamps, updatedAt: stamp.at },
  };
  saveConvictionMap(next);
  return next;
}
