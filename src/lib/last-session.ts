/** Last signed-in user, so the gate can skip "Checking sign-in" on refresh. */

import { LAST_USER_KEY as KEY, markSessionHint } from "@/lib/session-hint";

export type LastUser = { id: string; email: string | null };

export function loadLastUser(): LastUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastUser | null;
    if (!parsed?.id || typeof parsed.id !== "string") return null;
    return {
      id: parsed.id,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    return null;
  }
}

export function saveLastUser(user: LastUser | null) {
  if (typeof window === "undefined") return;
  /*
   * The root element carries the same answer, because the next first paint
   * is decided by CSS before any of this runs again (see session-hint.ts).
   * It is marked here rather than at each call site so a resolved session,
   * a resolved absence, a sign-out and an account switch all keep it true.
   */
  markSessionHint(Boolean(user));
  try {
    if (!user) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    /* ignore quota / private mode */
  }
}
