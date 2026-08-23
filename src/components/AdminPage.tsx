"use client";

import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";
import { MobileDock } from "@/components/mobile/MobileDock";
import { SignInGate } from "@/components/SignInGate";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { Score, Scoreboard } from "@/components/ui/Panel";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { plainError } from "@/lib/plain-error";
import { formatDateTime } from "@/lib/timezone";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  Bug,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { useNetworkResume } from "@/lib/use-network-resume";
import { NO_VALUE } from "@/lib/format";

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  profile_created_at: string | null;
  last_sign_in_at: string | null;
  portfolios?: { id: string; name: string }[];
  holding_count?: number;
};

type AdminFunnel = {
  signedIn: number;
  hasSheet: number;
  hasHoldings: number;
  usedAdvisor: number;
  returned7d: number;
  activated: number;
};

type AdminMember = {
  user_id: string;
  role: string;
  joined_at: string | null;
  email: string | null;
  display_name: string | null;
};

type AdminCommunity = {
  id: string;
  name: string;
  created_at: string | null;
  member_count: number;
  members: AdminMember[];
};

type AdminErrorLog = {
  id: string;
  source: "client" | "server";
  message: string;
  stack: string | null;
  digest: string | null;
  path: string | null;
  route_type: string | null;
  user_email: string | null;
  created_at: string;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return NO_VALUE;
  return formatDateTime(iso) || iso;
}

export function AdminPage() {
  const { user } = useAuth();
  /**
   * Delete one portfolio belonging to somebody else.
   *
   * Takes the id off the row that was clicked rather than anything typed, so
   * the operator is always acting on a portfolio they can see in front of
   * them. The route takes a pre-delete snapshot first and refuses if the
   * backup fails, so this is recoverable.
   */
  async function deletePortfolio(): Promise<void> {
    const target = pendingDelete;
    if (!target) return;
    const res = await fetch("/api/admin/delete-portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: target.portfolioId,
        confirm: "delete this portfolio",
      }),
    });
    const data: unknown = await res.json().catch(() => null);
    const row =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (!res.ok) {
      throw new Error(
        plainError(row.error, "Couldn't delete that portfolio. Try again.")
      );
    }
    setPendingDelete(null);
    await load(true);
  }

  /**
   * Revoke every refresh token, so everybody meets the signed-out page again.
   *
   * The confirmation phrase the route demands is sent from here rather than
   * typed by the operator: the dialog already made them say yes on purpose,
   * and the phrase exists to stop a stray fetch or a re-sent request, not to
   * quiz whoever is pressing the button.
   */
  async function signOutEveryone(): Promise<void> {
    setSignOutResult(null);
    const res = await fetch("/api/admin/sign-out-everyone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "sign out everyone" }),
    });
    const data: unknown = await res.json().catch(() => null);
    const row =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (!res.ok) {
      throw new Error(
        plainError(row.error, "Couldn't sign everyone out. Try again.")
      );
    }
    const revoked = typeof row.revoked === "number" ? row.revoked : 0;
    const failed = typeof row.failed === "number" ? row.failed : 0;
    const incomplete = row.incomplete === true;
    setSignOutResult(
      [
        `Revoked ${revoked} ${revoked === 1 ? "session" : "sessions"}.`,
        failed > 0 ? `${failed} could not be revoked.` : "",
        incomplete ? "The run did not finish, so some were missed." : "",
        "Anyone signed in right now keeps working until their token expires, so this lands over the next hour.",
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  const allowed = isSuperadminEmail(user?.email);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [funnel, setFunnel] = useState<AdminFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [errorLog, setErrorLog] = useState<AdminErrorLog[]>([]);
  const [errorLogLoading, setErrorLogLoading] = useState(true);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [confirmClearErrors, setConfirmClearErrors] = useState(false);
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    portfolioId: string;
    portfolioName: string;
    who: string;
    holdings: number;
  } | null>(null);
  const [signOutResult, setSignOutResult] = useState<string | null>(null);

  const loadAbortRef = useRef<AbortController | null>(null);
  const hasAdminDataRef = useRef(false);

  const loadErrorLog = useCallback(async (signal?: AbortSignal) => {
    setErrorLogLoading(true);
    try {
      const res = await fetch("/api/admin/errors", {
        cache: "no-store",
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setErrorLog(data.errors ?? []);
    } catch (e) {
      if (isAbortError(e)) return;
      /* non-critical secondary panel */
    } finally {
      if (!signal?.aborted) setErrorLogLoading(false);
    }
  }, []);

  async function clearErrorLog() {
    const res = await fetch("/api/admin/errors", { method: "DELETE" });
    if (!res.ok) return false;
    setErrorLog([]);
    return true;
  }

  const load = useCallback(
    async (isRefresh: boolean, signal?: AbortSignal) => {
      if (isRefresh) setRefreshing(true);
      else if (!hasAdminDataRef.current) setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/overview", {
          cache: "no-store",
          signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            plainError(data.error, "Couldn't load that page.")
          );
        }
        setUsers(data.users ?? []);
        setCommunities(data.communities ?? []);
        setFunnel(data.funnel ?? null);
        hasAdminDataRef.current = true;
      } catch (e) {
        if (isAbortError(e) || signal?.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't load that page.");
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      setErrorLogLoading(false);
      return;
    }
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    void load(false, ctrl.signal);
    void loadErrorLog(ctrl.signal);
    return () => ctrl.abort();
  }, [allowed, load, loadErrorLog]);

  useNetworkResume(() => {
    if (!allowed) return;
    const ctrl = new AbortController();
    loadAbortRef.current?.abort();
    loadAbortRef.current = ctrl;
    void load(true, ctrl.signal);
    void loadErrorLog(ctrl.signal);
  });

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.display_name, u.email, ...(u.portfolios?.map((p) => p.name) ?? [])]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [users, search]);

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileDock active={null} />
        <AppHeader title="Admin" />

        <main id="main" className={PAGE_MAIN_CLASS}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center card-sheen glass-well rounded-lg text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                Superadmin
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Activation funnel, then every signed-in profile and community.
              </p>
            </div>
          </div>

          {!allowed ? (
            <Alert variant="destructive">
              <AlertDescription>
                This account is not a superadmin.
              </AlertDescription>
            </Alert>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading overview …</p>
          ) : error ? (
            <p className="text-sm text-loss">{error}</p>
          ) : (
            <WidgetErrorBoundary name="Admin">
            <>
              {funnel && (
                <section className="flex flex-col gap-2">
                  <h2 className="font-semibold text-muted-foreground">
                    Activation
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Signed in, has a portfolio, has holdings, used Margus or Pulse,
                    signed in this week, and holdings plus a visit in the last
                    7 days.
                  </p>
                  <Scoreboard cols={2}>
                    <Score label="Signed in" value={funnel.signedIn} />
                    <Score label="Has a portfolio" value={funnel.hasSheet} />
                    <Score label="Has holdings" value={funnel.hasHoldings} />
                    <Score
                      label="Used Margus or Pulse"
                      value={funnel.usedAdvisor}
                    />
                    <Score label="Visited 7d" value={funnel.returned7d} />
                    <Score label="Active 7d" value={funnel.activated} />
                  </Scoreboard>
                </section>
              )}

              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                    <Bug className="h-3.5 w-3.5" />
                    Errors
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {errorLog.length >= 150 ? "150+" : errorLog.length} recent
                    </span>
                    {errorLog.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setConfirmClearErrors(true)}
                        title="Clear log"
                        aria-label="Clear error log"
                      >
                        <Trash2 />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => void loadErrorLog()}
                      disabled={errorLogLoading}
                      title="Refresh"
                      aria-label="Refresh error log"
                    >
                      <RefreshCw
                        className={errorLogLoading ? "animate-spin" : undefined}
                      />
                    </Button>
                  </div>
                </div>
                {errorLogLoading && errorLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading …</p>
                ) : errorLog.length === 0 ? (
                  <p className="rounded-xl border border-gain/40 bg-gain/10 px-4 py-4 text-center text-sm text-gain">
                    Nothing logged, all clear.
                  </p>
                ) : (
                  <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-xl glass ring-1 ring-foreground/20">
                    {errorLog.map((e) => {
                      const open = expandedError === e.id;
                      return (
                        <li key={e.id} className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => setExpandedError(open ? null : e.id)}
                            className="flex w-full items-start justify-between gap-2 text-left"
                          >
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-sm">
                                <span
                                  className={
                                    e.source === "server"
                                      ? "rounded bg-loss/15 px-1.5 py-0.5 font-medium text-loss"
                                      : "rounded bg-caution/15 px-1.5 py-0.5 font-medium text-caution"
                                  }
                                >
                                  {e.source}
                                </span>
                                <span className="truncate text-muted-foreground">
                                  {e.path || NO_VALUE}
                                </span>
                              </p>
                              <p className="mt-1 truncate text-sm text-foreground">
                                {e.message}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm text-muted-foreground">
                              {fmtDate(e.created_at)}
                            </span>
                          </button>
                          {open && (
                            <div className="flex flex-col mt-2 gap-1 rounded-lg bg-muted/80 p-2.5 text-sm text-muted-foreground">
                              {e.user_email && <p>User: {e.user_email}</p>}
                              {e.route_type && <p>Route type: {e.route_type}</p>}
                              {e.digest && <p>Digest: {e.digest}</p>}
                              {e.stack && (
                                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-sm text-muted-foreground">
                                  {e.stack}
                                </pre>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-muted-foreground">
                    Users signed in
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {filteredUsers.length}
                      {search ? ` of ${users.length}` : ""} profile
                      {users.length === 1 ? "" : "s"}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => void load(true)}
                      disabled={refreshing}
                      title="Refresh"
                      aria-label="Refresh user list"
                    >
                      <RefreshCw
                        className={refreshing ? "animate-spin" : undefined}
                      />
                    </Button>
                  </div>
                </div>
                {users.length > 3 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, email, or portfolio …"
                      className="pl-8"
                    />
                  </div>
                )}
                <ul className="divide-y divide-border overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
                  {filteredUsers.length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {users.length === 0
                        ? "No profiles yet."
                        : "No profiles match that search."}
                    </li>
                  ) : (
                    filteredUsers.map((u) => {
                      const noPortfolios = (u.portfolios?.length ?? 0) === 0;
                      return (
                        <li
                          key={u.id}
                          className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {u.display_name || NO_VALUE}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {u.email || u.id}
                            </p>
                            {u.bio ? (
                              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                                {u.bio}
                              </p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {noPortfolios ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md bg-caution/15 px-1.5 py-0.5 text-sm font-medium text-caution"
                                  title="Signed in but owns/co-owns no portfolio. Possible broken seed claim or invite redemption"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  0 portfolios
                                </span>
                              ) : (
                                u.portfolios!.map((p) => (
                                  /*
                                    * The chip is the delete control, because
                                    * the row is the only place an operator
                                    * can be certain which portfolio belongs
                                    * to which person. Nothing here is typed
                                    * or matched by name.
                                    */
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                      setPendingDelete({
                                        portfolioId: p.id,
                                        portfolioName: p.name,
                                        who: u.display_name || u.email || u.id,
                                        holdings: u.holding_count ?? 0,
                                      })
                                    }
                                    title={`Delete "${p.name}"`}
                                    className="group inline-flex items-center gap-1 rounded-md bg-accent/90 px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {p.name}
                                    <Trash2 className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                                  </button>
                                ))
                              )}
                              {(u.holding_count ?? 0) > 0 && (
                                <span className="text-sm text-muted-foreground">
                                  {u.holding_count} holding
                                  {u.holding_count === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-left text-sm text-muted-foreground sm:text-right">
                            <p>Last sign-in - {fmtDate(u.last_sign_in_at)}</p>
                            <p>Profile - {fmtDate(u.profile_created_at)}</p>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-muted-foreground">
                    Communities
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {communities.length}{" "}
                    {communities.length === 1 ? "community" : "communities"}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {communities.length === 0 ? (
                    <p className="rounded-xl glass ring-1 ring-foreground/20 px-4 py-6 text-center text-sm text-muted-foreground">
                      No communities yet.
                    </p>
                  ) : (
                    communities.map((c) => (
                      <article
                        key={c.id}
                        className="flex flex-col gap-3 rounded-xl glass ring-1 ring-foreground/20 p-6"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold text-foreground">
                              {c.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Created {fmtDate(c.created_at)} ·{" "}
                              {c.member_count} member
                              {c.member_count === 1 ? "" : "s"}
                            </p>
                          </div>
                          <Link
                            href={`/communities/${c.id}`}
                            className="text-sm font-medium text-primary/90 hover:underline"
                          >
                            Open
                          </Link>
                        </div>
                        <ul className="divide-y divide-border/80 overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
                          {(c.members ?? []).map((m) => (
                            <li
                              key={`${c.id}-${m.user_id}`}
                              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">
                                  {m.display_name || m.email || m.user_id}
                                </p>
                                {m.display_name && m.email ? (
                                  <p className="truncate text-sm text-muted-foreground">
                                    {m.email}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={
                                  m.role === "admin"
                                    ? "shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-semibold text-primary"
                                    : "shrink-0 text-sm text-muted-foreground"
                                }
                              >
                                {m.role}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))
                  )}
                </div>
              </section>
              <section className="flex flex-col gap-2">
                <h2 className="font-semibold text-muted-foreground">
                  Sessions
                </h2>
                <p className="text-sm text-muted-foreground">
                  Signs out every account, so the next thing anybody sees is
                  the signed-out page. Nothing is deleted and no holdings are
                  touched: people sign in again with Google.
                </p>
                <div className="card-sheen glass-well flex flex-col gap-3 rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setConfirmSignOutAll(true)}
                    >
                      <LogOut data-icon="inline-start" />
                      Sign everyone out
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Includes you.
                    </p>
                  </div>
                  {signOutResult && (
                    <Alert>
                      <AlertDescription>{signOutResult}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </section>
            </>
            </WidgetErrorBoundary>
          )}
        </main>
      </div>

      <ConfirmModal
        open={pendingDelete != null}
        title="Delete this portfolio?"
        body={
          pendingDelete
            ? `Deletes "${pendingDelete.portfolioName}" belonging to ${pendingDelete.who}, along with ${pendingDelete.holdings} holding${pendingDelete.holdings === 1 ? "" : "s"} on that account. A snapshot is saved first, so it can be restored. They keep their account and can start again from an empty portfolio.`
            : ""
        }
        confirmLabel="Delete portfolio"
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={deletePortfolio}
      />

      <ConfirmModal
        open={confirmSignOutAll}
        title="Sign everyone out?"
        body="Every account is signed out, including yours, and everybody lands on the signed-out page next time they open the app. Nothing is deleted. Anyone signed in right now keeps working until their token expires, so this lands over the next hour rather than at once."
        confirmLabel="Sign everyone out"
        destructive
        onClose={() => setConfirmSignOutAll(false)}
        onConfirm={signOutEveryone}
      />

      <ConfirmModal
        open={confirmClearErrors}
        title="Clear error log?"
        body="Removes all logged errors. This doesn't fix anything, it just clears the list once you've triaged it."
        confirmLabel="Clear"
        destructive
        onClose={() => setConfirmClearErrors(false)}
        onConfirm={clearErrorLog}
      />
    </SignInGate>
  );
}
