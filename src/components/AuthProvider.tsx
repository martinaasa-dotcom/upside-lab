"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { purgeClientSession } from "@/lib/auth/purge-session";
import { clearBookCache } from "@/lib/book-cache";
import { loadLastUser, saveLastUser } from "@/lib/last-session";
import { markSessionHint } from "@/lib/session-hint";
import { currentInternalNext } from "@/lib/site-url";

export type AuthProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

type AuthState = {
  ready: boolean;
  user: User | null;
  profile: AuthProfile | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function stubUser(id: string, email: string | null): User {
  return {
    id,
    email: email ?? undefined,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useLayoutEffect(() => {
    const last = loadLastUser();
    /*
     * Re-stamp the root element. The inline script in the root layout put
     * the mark there before the first paint, and React's Strict Mode
     * remount in development resets `<html>` to the attributes it manages
     * from JSX, which drops it. A no-op in production, and it costs one
     * attribute write. See `src/lib/session-hint.ts`.
     */
    markSessionHint(Boolean(last));
    if (!last) return;
    setUser(stubUser(last.id, last.email));
    setReady(true);
  }, []);

  const loadProfile = useCallback(async (u: User | null, signal?: AbortSignal) => {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store", signal });
      if (signal?.aborted) return;
      if (!res.ok) {
        setProfile({
          id: u.id,
          email: u.email ?? null,
          display_name: u.user_metadata?.full_name ?? null,
          avatar_url: u.user_metadata?.avatar_url ?? null,
        });
        return;
      }
      const data = await res.json();
      if (signal?.aborted) return;
      setProfile(data.profile ?? null);
    } catch {
      if (signal?.aborted) return;
      setProfile({
        id: u.id,
        email: u.email ?? null,
        display_name: null,
        avatar_url: null,
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setUser(null);
      setProfile(null);
      setReady(true);
      return;
    }
    // Cleared in `finally` so a fast auth check doesn't leave an 8s timer
    // (and its rejected promise) dangling behind every single page load.
    let timeoutId: number | undefined;
    try {
      // Session check only — don't block the sign-in gate on profile/claims.
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error("auth timeout")),
            8000
          );
        }),
      ]);
      const next = result.data.user ?? null;
      if (next) {
        // A different account than whatever this browser last had signed
        // in (shared/borrowed device, or a session that expired without an
        // explicit Sign out) — purge per-user local caches (Lab conviction
        // notes, watchlist, Pulse history, community lists, …) *before*
        // exposing the new user, so nothing from the previous account is
        // still sitting in localStorage for a child effect to read and,
        // worse, push up into this account's own Supabase rows.
        const last = loadLastUser();
        if (last && last.id !== next.id) {
          await purgeClientSession();
        }
        saveLastUser({ id: next.id, email: next.email ?? null });
        setUser(next);
        setReady(true);
        void loadProfile(next);
      } else {
        /*
         * The session is gone and nobody pressed Sign out: it expired, or
         * another tab ended it, or the cookie went. `SIGNED_OUT` is not
         * guaranteed to arrive for any of those, and on a cold load there
         * is no listener yet to hear it, so this branch is where it has to
         * be handled.
         *
         * Forgetting the last user without purging was the worst of both.
         * The previous account's local caches stayed (Lab Pulse history,
         * watchlist, Pulse history, chat, IndexedDB, the offline write
         * queue) and the record of whose they were was erased with
         * `saveLastUser(null)`, so the next person to sign in on this
         * browser was not recognised as a switch by the guard above and
         * simply inherited them, queued writes included.
         */
        const last = loadLastUser();
        setUser(null);
        setReady(true);
        setProfile(null);
        if (last) {
          await purgeClientSession();
        } else {
          saveLastUser(null);
          clearBookCache();
        }
      }
    } catch {
      // Keep the last-known user on a flaky network. Kicking someone to
      // the sign-in screen because getUser timed out is worse than showing
      // a slightly stale book.
      setReady(true);
      if (!loadLastUser()) {
        setUser(null);
        setProfile(null);
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  }, [loadProfile]);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setReady(true);
      return;
    }
    const profileCtrl = new AbortController();
    void refresh();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user ?? null;
      if (next) {
        // Same account-switch guard as `refresh()` above — this listener
        // also fires on a fresh sign-in on a device that still has another
        // account's local caches sitting in localStorage.
        const last = loadLastUser();
        if (last && last.id !== next.id) {
          void purgeClientSession().then(() => {
            saveLastUser({ id: next.id, email: next.email ?? null });
            setUser(next);
            setReady(true);
            void loadProfile(next, profileCtrl.signal);
          });
          return;
        }
        setUser(next);
        setReady(true);
        saveLastUser({ id: next.id, email: next.email ?? null });
        void loadProfile(next, profileCtrl.signal);
        return;
      }
      if (event === "SIGNED_OUT") {
        setUser(null);
        setReady(true);
        setProfile(null);
        void purgeClientSession();
      }
    });
    return () => {
      profileCtrl.abort();
      subscription.unsubscribe();
    };
  }, [loadProfile, refresh]);

  const signInWithGoogle = useCallback(async () => {
    const next = encodeURIComponent(currentInternalNext());
    // Route Handler 302s to Google. router.push would treat this as a page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full document navigation
    window.location.assign(
      `${window.location.origin}/auth/google?next=${next}`
    );
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST", cache: "no-store" });
    } catch {
      /* still wipe local state */
    }
    const supabase = createSupabaseBrowser();
    if (supabase) {
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        /* tokens may already be revoked */
      }
    }
    setUser(null);
    setProfile(null);
    await purgeClientSession();
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      profile,
      signInWithGoogle,
      signOut,
      refresh,
    }),
    [ready, user, profile, signInWithGoogle, signOut, refresh]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
