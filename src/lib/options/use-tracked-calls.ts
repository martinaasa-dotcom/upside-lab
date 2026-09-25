"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CALL_RULES,
  MAX_TRACKED_CALLS,
  sanitizeRules,
  validateCallDraft,
  type CallRules,
  type TrackedCall,
  type TrackedCallDraft,
} from "@/lib/options/tracked-calls";

/*
  The calls a portfolio has sold or plans to sell, wherever they live.

  Signed in, they are the account's (`/api/covered-calls`), so a call
  entered on the laptop is tracked on the phone and by a co-owner. On the
  sample, where there is no account, they live in this browser under a key
  per portfolio, which is the same arrangement every other sample edit has.
  Writes are optimistic: the row changes on the press and is put back if
  the server refuses, with the refusal's own sentence.
*/

const LOCAL_KEY = (portfolioId: string) => `upside-covered-calls-v1:${portfolioId}`;
const RULES_KEY = "upside-cc-rules-v1";

function readLocal(portfolioId: string): TrackedCall[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY(portfolioId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      const v = validateCallDraft(row);
      const id = row && typeof row === "object" ? (row as { id?: unknown }).id : null;
      return v.ok && typeof id === "string"
        ? [{ ...v.draft, id, portfolio_id: portfolioId }]
        : [];
    });
  } catch {
    return [];
  }
}

function writeLocal(portfolioId: string, calls: TrackedCall[]) {
  try {
    window.localStorage.setItem(LOCAL_KEY(portfolioId), JSON.stringify(calls));
  } catch {
    /* a private window: the edit lives for this visit */
  }
}

function localId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const said = typeof body?.error === "string" ? body.error : "";
  // A database error is a code for us, not a sentence for the reader.
  return said && said !== "Database error" ? said : fallback;
}

export type TrackedCallsStore = {
  /** Every call on every portfolio the store was given, for the alerts. */
  calls: TrackedCall[];
  ready: boolean;
  /** Adds to the open portfolio. */
  add: (draft: TrackedCallDraft) => Promise<string | null>;
  update: (id: string, draft: TrackedCallDraft) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
};

/**
 * Every tracked call on every portfolio the reader owns, and writes to the
 * one that is open.
 *
 * All of them rather than the open one's, because Home's alerts read this
 * too: a call past its roll level is worth saying whichever portfolio the
 * reader happens to be looking at. The panel filters to the open portfolio.
 */
export function useTrackedCalls(
  portfolioIds: readonly string[],
  activeId: string | null,
  remote: boolean,
  enabled: boolean
): TrackedCallsStore {
  const [calls, setCalls] = useState<TrackedCall[]>([]);
  const [ready, setReady] = useState(false);
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const idsKey = [...portfolioIds].sort().join(",");

  useEffect(() => {
    setReady(false);
    if (!enabled || !idsKey) {
      setCalls([]);
      return;
    }
    if (!remote) {
      setCalls(idsKey.split(",").flatMap((id) => readLocal(id)));
      setReady(true);
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/covered-calls", { signal: ctrl.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { calls?: TrackedCall[] };
        if (!ctrl.signal.aborted) setCalls(Array.isArray(body.calls) ? body.calls : []);
      } catch {
        /* aborted or offline: the panel shows none rather than an error */
      } finally {
        if (!ctrl.signal.aborted) setReady(true);
      }
    })();
    return () => ctrl.abort();
  }, [idsKey, remote, enabled]);

  /** Local mode: store the portfolio each touched call belongs to. */
  const commitLocal = useCallback((next: TrackedCall[], touched: string) => {
    setCalls(next);
    writeLocal(
      touched,
      next.filter((c) => c.portfolio_id === touched)
    );
  }, []);

  const add = useCallback(
    async (draft: TrackedCallDraft): Promise<string | null> => {
      if (!activeId) return "Open a portfolio first.";
      const here = callsRef.current.filter((c) => c.portfolio_id === activeId);
      if (here.length >= MAX_TRACKED_CALLS) {
        return `A portfolio can track up to ${MAX_TRACKED_CALLS} calls. Remove an old one first.`;
      }
      if (!remote) {
        commitLocal(
          [...callsRef.current, { ...draft, id: localId(), portfolio_id: activeId }],
          activeId
        );
        return null;
      }
      try {
        const res = await fetch("/api/covered-calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, portfolio_id: activeId }),
        });
        if (!res.ok) return errorOf(res, "Couldn't save that call. Try again.");
        const body = (await res.json()) as { call?: TrackedCall };
        if (body.call) setCalls((prev) => [...prev, body.call!]);
        return null;
      } catch {
        return "Couldn't save that call. Check your connection.";
      }
    },
    [activeId, remote, commitLocal]
  );

  const update = useCallback(
    async (id: string, draft: TrackedCallDraft): Promise<string | null> => {
      const before = callsRef.current;
      const target = before.find((c) => c.id === id);
      if (!target) return "That call is no longer here.";
      const next = before.map((c) => (c.id === id ? { ...c, ...draft } : c));
      if (!remote) {
        commitLocal(next, target.portfolio_id);
        return null;
      }
      setCalls(next);
      try {
        const res = await fetch("/api/covered-calls", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, id }),
        });
        if (!res.ok) {
          setCalls(before);
          return errorOf(res, "Couldn't save that change. Try again.");
        }
        return null;
      } catch {
        setCalls(before);
        return "Couldn't save that change. Check your connection.";
      }
    },
    [remote, commitLocal]
  );

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      const before = callsRef.current;
      const target = before.find((c) => c.id === id);
      if (!target) return null;
      const next = before.filter((c) => c.id !== id);
      if (!remote) {
        commitLocal(next, target.portfolio_id);
        return null;
      }
      setCalls(next);
      try {
        const res = await fetch(`/api/covered-calls?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          setCalls(before);
          return errorOf(res, "Couldn't remove that call. Try again.");
        }
        return null;
      } catch {
        setCalls(before);
        return "Couldn't remove that call. Check your connection.";
      }
    },
    [remote, commitLocal]
  );

  return { calls, ready, add, update, remove };
}

/**
 * The reader's two rules, kept on this device. They are a preference about
 * how to manage calls rather than a fact about a portfolio, and the
 * defaults are the conventions most people start from.
 */
export function useCallRules(): [CallRules, (next: CallRules) => void] {
  const [rules, setRules] = useState<CallRules>(DEFAULT_CALL_RULES);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RULES_KEY);
      if (raw) setRules(sanitizeRules(JSON.parse(raw)));
    } catch {
      /* defaults */
    }
  }, []);
  const save = useCallback((next: CallRules) => {
    const clean = sanitizeRules(next);
    setRules(clean);
    try {
      window.localStorage.setItem(RULES_KEY, JSON.stringify(clean));
    } catch {
      /* this visit only */
    }
  }, []);
  return [rules, save];
}
