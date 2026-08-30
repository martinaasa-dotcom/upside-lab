/** Persist dismissed alert ids so toast spam doesn't return every session. */

const KEY = "upside-alerts-dismissed-v1";

export function loadDismissedAlertIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveDismissedAlertIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* ignore */
  }
}
