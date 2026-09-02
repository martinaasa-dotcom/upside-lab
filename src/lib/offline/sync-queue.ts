import { isAbortError, isNetworkError } from "@/lib/abort";
import { loadLastUser } from "@/lib/last-session";
import {
  idbQueueDelete,
  idbQueueGetAll,
  idbQueuePut,
} from "@/lib/offline/idb";

export type SyncKind = "preference" | "draft";
export type SyncMethod = "POST" | "PUT" | "PATCH";

export type SyncJob = {
  id: string;
  kind: SyncKind;
  url: string;
  method: SyncMethod;
  body: unknown;
  createdAt: number;
  retries: number;
  /** The account this write was made in. Older jobs have none. */
  userId?: string | null;
};

/** Same-origin writes that are safe to replay later. Holdings CRUD is not. */
export const QUEUEABLE_PATHS = [
  "/api/account/experience-tier",
  "/api/account/weekly-note",
  "/api/lab",
  "/api/feedback",
] as const;

const MAX_RETRIES = 8;

export function queueablePath(url: string): string | null {
  try {
    const path = url.startsWith("http")
      ? new URL(url).pathname
      : url.split("?")[0] ?? url;
    const match = QUEUEABLE_PATHS.find((p) => path === p);
    return match ?? null;
  } catch {
    return null;
  }
}

export function isQueueableRequest(url: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m !== "POST" && m !== "PUT" && m !== "PATCH") return false;
  return queueablePath(url) != null;
}

/**
 * Preferences collapse to the latest body per path. Feedback drafts each
 * stay their own job so two notes don't overwrite each other.
 */
export function coalesceKey(job: {
  kind: SyncKind;
  url: string;
  method: string;
}): string | null {
  if (job.kind === "draft") return null;
  const path = queueablePath(job.url);
  if (!path) return null;
  return `${job.kind}:${job.method.toUpperCase()}:${path}`;
}

/**
 * What to do with a queued write now that we know who is signed in.
 *
 * A job is a write somebody made offline, and this queue outlives the
 * session that filled it: a session can end without a sign out, and the
 * next person to open the app on this browser is a different account with
 * different cookies. Replaying one of these under them would file somebody
 * else's note, preference or feedback into their account.
 *
 * So a job is only sent under the account it was written in. A job with no
 * account on it was either written before jobs carried one or written with
 * no session at all, and is not provably anybody's, so it is never sent: it
 * waits while nobody is signed in, in case its own account comes back
 * within the same page, and is dropped as soon as somebody else is.
 */
export function syncJobVerdict(
  job: { userId?: string | null },
  userId: string | null
): "send" | "hold" | "drop" {
  const owner = job.userId ?? null;
  if (!userId) return "hold";
  if (!owner) return "drop";
  return owner === userId ? "send" : "drop";
}

function currentUserId(): string | null {
  return loadLastUser()?.id ?? null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueSync(input: {
  kind: SyncKind;
  url: string;
  method: SyncMethod;
  body: unknown;
}): Promise<SyncJob | null> {
  if (typeof window === "undefined") return null;
  if (!isQueueableRequest(input.url, input.method)) return null;
  const job: SyncJob = {
    id: newId(),
    kind: input.kind,
    url: queueablePath(input.url) ?? input.url,
    method: input.method,
    body: input.body,
    createdAt: Date.now(),
    retries: 0,
    userId: currentUserId(),
  };
  const key = coalesceKey(job);
  if (key) {
    const existing = await idbQueueGetAll<SyncJob>();
    await Promise.all(
      existing
        .filter((row) => coalesceKey(row) === key)
        .map((row) => idbQueueDelete(row.id))
    );
  }
  await idbQueuePut(job);
  return job;
}

function parseBody(job: SyncJob): BodyInit | undefined {
  if (job.body == null) return undefined;
  if (typeof job.body === "string") return job.body;
  try {
    return JSON.stringify(job.body);
  } catch {
    return undefined;
  }
}

function shouldDropStatus(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return true;
  }
  return false;
}

let flushing = false;

export async function flushSyncQueue(): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    const userId = currentUserId();
    const jobs = (await idbQueueGetAll<SyncJob>()).sort(
      (a, b) => a.createdAt - b.createdAt
    );
    for (const job of jobs) {
      if (!job?.id || !job.url) {
        if (job?.id) await idbQueueDelete(job.id);
        continue;
      }
      const verdict = syncJobVerdict(job, userId);
      if (verdict === "hold") continue;
      if (verdict === "drop") {
        await idbQueueDelete(job.id);
        continue;
      }
      try {
        const res = await fetch(job.url, {
          method: job.method,
          headers: { "Content-Type": "application/json" },
          body: parseBody(job),
          cache: "no-store",
        });
        if (shouldDropStatus(res.status)) {
          await idbQueueDelete(job.id);
          sent += 1;
          continue;
        }
        const next = { ...job, retries: (job.retries ?? 0) + 1 };
        if (next.retries >= MAX_RETRIES) {
          await idbQueueDelete(job.id);
        } else {
          await idbQueuePut(next);
        }
      } catch (err) {
        if (isAbortError(err) || isNetworkError(err)) {
          const next = { ...job, retries: (job.retries ?? 0) + 1 };
          if (next.retries >= MAX_RETRIES) await idbQueueDelete(job.id);
          else await idbQueuePut(next);
          return sent;
        }
        await idbQueueDelete(job.id);
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

let listening = false;

/** Flush on reconnect, tab-return, and a service-worker sync ping. */
export function startSyncQueueListener(): () => void {
  if (typeof window === "undefined" || listening) return () => undefined;
  listening = true;
  const onOnline = () => {
    void flushSyncQueue();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void flushSyncQueue();
  };
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string } | null;
    if (data?.type === "upside-flush-sync") void flushSyncQueue();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  navigator.serviceWorker?.addEventListener("message", onMessage);
  void flushSyncQueue();
  return () => {
    listening = false;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.removeEventListener("message", onMessage);
  };
}
