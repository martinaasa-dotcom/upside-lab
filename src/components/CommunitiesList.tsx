"use client";

import { SignInGate } from "@/components/SignInGate";
import { AppHeader } from "@/components/AppHeader";
import { MobileDock } from "@/components/mobile/MobileDock";
import { cn } from "@/lib/format";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { plainError } from "@/lib/plain-error";
import {
  loadCommunityCache,
  loadCommunityDiscoverCache,
  loadCommunityListCache,
  prefetchCommunity,
  prefetchCommunityList,
  saveCommunityDiscoverCache,
  saveCommunityListCache,
  type CommunityDiscoverRow,
  type CommunityListRow,
} from "@/lib/community-cache";
import { StartingCashField } from "@/components/StartingCashField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { aimOnPress } from "@/lib/route-aim";
import { Panel, PanelHeader, Segmented } from "@/components/ui/Panel";
import {
  CLASS_TEMPLATES,
  classTemplateById,
  defaultClassSetup,
} from "@/lib/class-templates";
import { DEFAULT_CLASS_ASSIGNMENT } from "@/lib/classroom";
import {
  ChevronRight,
  Compass,
  Globe,
  GraduationCap,
  Lock,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAbortError } from "@/lib/abort";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { useNetworkResume } from "@/lib/use-network-resume";
import { useEffect, useState } from "react";
import { onWorkspaceRefresh } from "@/lib/workspace-rooms";

type DiscoverRow = CommunityDiscoverRow;

/**
 * How many people are in a circle, read out of the copy of it already
 * warmed in this browser by `prefetchCommunityList`.
 *
 * The row used to print the caller's own role, capitalised: "Aasa family ·
 * Admin". That is a database column, not a thing a person wants to know
 * about a room they are about to walk into, and a class row read "Econ 201
 * · Class · Member".
 *
 * Deliberately not "2 up today". A list row paints from whatever is in the
 * cache, which on a cold morning is Friday's prices, and this app does not
 * state a day's move as fact from a figure it cannot vouch for. A member
 * count does not go stale in that way.
 */
function peopleLabel(communityId: string): string | null {
  const cached = loadCommunityCache(communityId);
  const meta = cached?.meta as { members?: unknown[] } | undefined;
  const count = Array.isArray(meta?.members) ? meta.members.length : 0;
  if (count <= 0) return null;
  return count === 1 ? "1 person" : `${count} people`;
}

export function CommunitiesList() {
  const router = useRouter();
  // Hydration-safe: /communities has no auth gate in front of it, so this
  // component really is server-rendered, and seeding state straight from
  // localStorage during render made the server and client trees disagree.
  const [communities, setCommunities] = useHydratedCache<CommunityListRow[]>(
    () => loadCommunityListCache() ?? [],
    []
  );
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"circle" | "classroom">("circle");
  const initialClass = defaultClassSetup();
  const [templateId, setTemplateId] = useState(initialClass.templateId);
  const [startingCash, setStartingCash] = useState(initialClass.cash);
  const [assignment, setAssignment] = useState(initialClass.assignment);
  const [startPeriod, setStartPeriod] = useState(initialClass.period);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [startOpen, setStartOpen] = useState(false);
  const [warm, setWarm] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Only blocks on a spinner when there's truly nothing cached to show —
  // same instant-first-paint pattern as Thesis Pulse and the community detail
  // view. Server-safe value is true (no cache exists there); the cache check
  // runs in a layout effect, so a warm cache still skips the spinner in the
  // first painted frame.
  const [loading, setLoading] = useHydratedCache(
    () => (loadCommunityListCache()?.length ?? 0) === 0,
    true
  );
  const [discover, setDiscover] = useHydratedCache<DiscoverRow[]>(
    () => loadCommunityDiscoverCache() ?? [],
    []
  );
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [joinPick, setJoinPick] = useState<{
    communityId: string;
    name: string;
    sheets: { id: string; name: string }[];
    selected: string[];
  } | null>(null);

  async function load(signal?: AbortSignal) {
    const hadCache = (loadCommunityListCache()?.length ?? 0) > 0;
    if (!hadCache) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/communities", { cache: "no-store", signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError(data.error, "Couldn't load your circles.")
        );
      }
      const rows = (data.communities ?? []) as CommunityListRow[];
      setCommunities(rows);
      saveCommunityListCache(rows);
      /*
        The row wants to say how many people are in each circle, and that
        answer lives in the copy `prefetchCommunity` warms rather than in
        the list response. Warming is fire and forget, so nothing told this
        component when the answer arrived and every row rendered without
        one. `warm` is the nudge: one re-render once the copies have landed.
      */
      void Promise.all(rows.map((row) => prefetchCommunity(row.id))).then(() => {
        if (!signal?.aborted) setWarm((n) => n + 1);
      });
    } catch (e) {
      if (isAbortError(e) || signal?.aborted) return;
      if (!hadCache) setError(e instanceof Error ? e.message : "Couldn't load your circles.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function loadDiscover(signal?: AbortSignal) {
    try {
      const res = await fetch("/api/communities/discover", {
        cache: "no-store",
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const rows = (data.communities ?? []) as DiscoverRow[];
        setDiscover(rows);
        saveCommunityDiscoverCache(rows);
      }
    } catch {
      /* best-effort — discover is a bonus section, not the main list */
    }
  }

  useEffect(() => {
    prefetchCommunityList(loadCommunityListCache() ?? []);
    const ctrl = new AbortController();
    void load(ctrl.signal);
    void loadDiscover(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  useNetworkResume(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    void loadDiscover(ctrl.signal);
  });

  /* A pull asks for the same pair the network coming back asks for. */
  useEffect(
    () =>
      onWorkspaceRefresh("communities", () => {
        const ctrl = new AbortController();
        return Promise.all([load(ctrl.signal), loadDiscover(ctrl.signal)]);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load/loadDiscover are stable per render and read current state
    []
  );

  async function sendJoinRequest(
    communityId: string,
    portfolioIds: string[] | null
  ) {
    setRequestBusyId(communityId);
    try {
      const res = await fetch(`/api/communities/${communityId}/join-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          portfolioIds != null ? { portfolioIds } : {}
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(plainError(data.error, "Couldn't send that request."));
        return;
      }
      setJoinPick(null);
      setDiscover((rows) => {
        const next = rows.map((r) =>
          r.id === communityId ? { ...r, requestStatus: "pending" as const } : r
        );
        saveCommunityDiscoverCache(next);
        return next;
      });
    } finally {
      setRequestBusyId(null);
    }
  }

  async function beginJoinRequest(communityId: string, communityName: string) {
    setRequestBusyId(communityId);
    setError(null);
    try {
      const res = await fetch("/api/portfolios", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError(data.error, "Couldn't load your portfolios.")
        );
      }
      const sheets = (
        (data.portfolios ?? []) as {
          id: string;
          name: string;
          classroom_community_id?: string | null;
        }[]
      )
        .filter((p) => !p.classroom_community_id)
        .map((p) => ({ id: p.id, name: p.name }));
      if (sheets.length === 0) {
        await sendJoinRequest(communityId, null);
        return;
      }
      setJoinPick({
        communityId,
        name: communityName,
        sheets,
        selected: sheets.map((s) => s.id),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't load your portfolios."
      );
    } finally {
      setRequestBusyId(null);
    }
  }

  async function createCommunity(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        kind === "classroom"
          ? {
              name: name.trim(),
              kind: "classroom",
              startingCash,
              assignment: assignment.trim() || DEFAULT_CLASS_ASSIGNMENT,
              startPeriod,
            }
          : { name: name.trim(), visibility }
      ),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(plainError(data.error, "Couldn't create that circle."));
      return;
    }
    setName("");
    setAssignment("");
    const id = (data.community as { id?: string } | undefined)?.id;
    if (id) {
      router.push(`/communities/${id}`);
      return;
    }
    await load();
  }

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileDock active="circle" />
        <AppHeader title="Circle" mobileTitle="" />
        <main id="main" className={PAGE_MAIN_CLASS}>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Circle
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              People you invite, and public circles you can ask to join. You pick which portfolios they see. They see prices from today, not what you paid.
            </p>
          </div>
          {/*
            * A designed row rather than a loose red sentence.
            *
            * The circles below still render from cache when this fires, so
            * it is a partial failure and must not take the page over the
            * way `LoadError` does on a room with nothing else in it. What
            * it must not stay is an unlabelled string in the loss colour
            * floating between the heading and the first card, which reads
            * as a stack trace that escaped.
            */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Panel>
            <PanelHeader
              title="Your circles"
              subtitle="Tap one to open it."
              icon={<Users className="h-4 w-4" />}
            />
            {communities.length === 0 && loading ? (
              <div className="flex flex-col gap-2" aria-hidden>
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-[3.75rem]" />
                ))}
              </div>
            ) : (
              <ul className="card-sheen glass-well divide-y divide-border overflow-hidden rounded-lg">
                {communities.length === 0 && (
                  <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <Users className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm text-foreground">
                      You are not in a circle yet.
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Start one below for friends or family, or request to join
                      a public circle further down.
                    </p>
                  </li>
                )}
                {communities.map((c) => {
                  // `warm` is only in the dependency list to re-read the
                  // cache after the copies land; see `load` above.
                  void warm;
                  const people = peopleLabel(c.id);
                  return (
                  <li key={c.id}>
                    <Link
                      href={`/communities/${c.id}`}
                      onPointerEnter={() => void prefetchCommunity(c.id)}
                      onFocus={() => void prefetchCommunity(c.id)}
                      /*
                       * Say where this is going, so the shell mounts the
                       * circle on the press instead of when the router
                       * finishes building it. See `route-aim.ts`.
                       *
                       * On `pointerdown`, and `click` was measured and is
                       * not good enough: a click handler runs in the same
                       * event as the navigation, so React batches the two
                       * and the aim gets no head start at all. Measured
                       * opening a circle at 4x CPU, the room appeared at
                       * 514ms either way with `onClick`, and at 457ms on
                       * the press.
                       *
                       * And the press navigates. Mounting the circle hides
                       * this list, so the click this Link was waiting for
                       * lands on the new room instead and never arrives;
                       * `aimOnPress` judges the tap and takes it there.
                       */
                      onPointerDown={(e) => {
                        aimOnPress(
                          e.nativeEvent,
                          `/communities/${c.id}`,
                          (path) => router.push(path)
                        );
                      }}
                      className="flex items-center justify-between gap-3 px-4 py-4 transition hover:bg-hover"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {c.kind === "classroom" ? (
                          <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                        ) : c.visibility === "public" ? (
                          <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 truncate text-base font-semibold text-foreground">
                          {c.name}
                        </span>
                        {c.kind === "classroom" ? (
                          <span className="shrink-0 text-sm text-muted-foreground">
                            Class
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {people ? (
                          <span className="text-sm text-muted-foreground">
                            {people}
                          </span>
                        ) : null}
                        {c.role === "admin" ? (
                          <Badge variant="secondary">Admin</Badge>
                        ) : null}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Public circles"
              subtitle="Anyone can ask to join. You pick which portfolios they can see. An admin still has to approve."
              icon={<Compass className="h-4 w-4" />}
            />
            {discover.length === 0 ? (
              <p className="card-sheen glass-well rounded-lg px-4 py-6 text-sm leading-relaxed text-muted-foreground">
                There are no public circles right now. If you start one, set
                it to Public so that people can ask to join it.
              </p>
            ) : (
              <ul className="card-sheen glass-well divide-y divide-border overflow-hidden rounded-lg">
                {discover.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="min-w-0 truncate text-base font-medium text-foreground">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {c.memberCount}{" "}
                          {c.memberCount === 1 ? "member" : "members"}
                        </span>
                      </span>
                      {c.houseNote?.trim() ? (
                        <span className="pl-4 text-sm leading-relaxed text-muted-foreground">
                          {c.houseNote.trim()}
                        </span>
                      ) : null}
                    </span>
                    {c.requestStatus === "pending" ? (
                      <span className="shrink-0 text-sm font-medium text-caution">
                        Waiting for approval
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void beginJoinRequest(c.id, c.name)}
                        disabled={requestBusyId === c.id}
                      >
                        {requestBusyId === c.id
                          ? "Requesting …"
                          : c.requestStatus === "rejected"
                            ? "Request again"
                            : "Request to join"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/*
            About 330px of form used to sit at the bottom of this page for
            everybody, including somebody already in three circles, and on a
            phone that is a whole screen below the fold of a form they are
            not filling in. It opens on a press now, and it starts open only
            for a reader who is in nothing yet, which is the one person the
            page is really for.
          */}
          {!startOpen && communities.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setStartOpen(true)}
            >
              <Plus data-icon="inline-start" />
              Start a circle or a class
            </Button>
          ) : (
          <form onSubmit={(e) => void createCommunity(e)}>
            <Panel>
              <PanelHeader
                title="Start a circle"
                subtitle={
                  kind === "classroom"
                    ? "High school or university. Students join with a link, everyone starts with the same paper cash and an empty portfolio, and the prices are real. No real money changes hands."
                    : "A private circle for people you invite, or a public one people can ask to join."
                }
                actions={
                  <Segmented
                    ariaLabel="What to start"
                    options={[
                      { id: "circle", label: "Circle" },
                      { id: "classroom", label: "Class" },
                    ]}
                    value={kind}
                    onChange={setKind}
                  />
                }
              />

              <div className="flex flex-col gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-muted-foreground">
                    {kind === "classroom" ? "Class name" : "Name"}
                  </span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      kind === "classroom" ? "Econ 201" : "The Aasa family"
                    }
                    className="mt-2"
                  />
                </label>

                {kind === "classroom" ? (
                  <>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        How the class runs
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Pick the closest match. You can change the cash, the
                        note, and the trading rules after you start.
                      </p>
                      <div className="divide-y divide-border">
                        {CLASS_TEMPLATES.map((t) => {
                          const on = templateId === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                const next = classTemplateById(t.id);
                                setTemplateId(next.id);
                                setStartingCash(next.cash);
                                setAssignment(next.assignment);
                                setStartPeriod(next.period);
                              }}
                              className={cn(
                                "flex w-full flex-col gap-1 py-4 text-left transition first:pt-1 last:pb-1",
                                on
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span
                                className={cn(
                                  "text-sm font-semibold",
                                  on ? "text-foreground" : "text-foreground"
                                )}
                              >
                                {t.title}
                              </span>
                              <span className="text-sm leading-relaxed text-muted-foreground">
                                {t.blurb}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <StartingCashField
                      value={startingCash}
                      onChange={setStartingCash}
                    />
                    <label className="block">
                      <span className="text-sm font-medium text-muted-foreground">
                        What we&apos;re learning
                      </span>
                      <Textarea
                        value={assignment}
                        onChange={(e) => setAssignment(e.target.value)}
                        maxLength={800}
                        rows={4}
                        placeholder={DEFAULT_CLASS_ASSIGNMENT}
                        className="mt-2 min-h-24 leading-relaxed"
                      />
                    </label>
                  </>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Who can join</p>
                    <div className="mt-3">
                      <Segmented
                        ariaLabel="Who can join"
                        columns={2}
                        options={[
                          { id: "private", label: "Invite only" },
                          { id: "public", label: "Anyone can request" },
                        ]}
                        value={visibility}
                        onChange={setVisibility}
                      />
                    </div>
                  </div>
                )}

                <Button type="submit">
                  {kind === "classroom" ? "Start a class" : "Start circle"}
                </Button>
              </div>
            </Panel>
          </form>
          )}
        </main>
      </div>

      {joinPick && (
        <ViewportOverlay
          className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClose={() => setJoinPick(null)}
          ariaLabelledBy="join-share-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setJoinPick(null)}
          />
          <div
            className="scroll-host relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover p-6 ring-1 ring-foreground/20 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-xl sm:pb-6"
          >
            <h3
              id="join-share-title"
              className="text-base font-semibold text-foreground"
            >
              What should {joinPick.name} see?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Every portfolio is shared to start with. Turn one off to keep it
              private. You can change this later.
            </p>
            <ul className="flex flex-col mt-4 gap-2">
              {joinPick.sheets.map((s) => {
                const on = joinPick.selected.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setJoinPick((prev) =>
                          prev
                            ? {
                                ...prev,
                                selected: on
                                  ? prev.selected.filter((id) => id !== s.id)
                                  : [...prev.selected, s.id],
                              }
                            : prev
                        )
                      }
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                        on
                          ? "border-border bg-accent text-foreground"
                          : "border-border bg-muted/60 text-muted-foreground"
                      )}
                    >
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {on ? "On" : "Off"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setJoinPick(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={requestBusyId === joinPick.communityId}
                onClick={() =>
                  void sendJoinRequest(joinPick.communityId, joinPick.selected)
                }
              >
                {requestBusyId === joinPick.communityId
                  ? "Requesting …"
                  : "Send request"}
              </Button>
            </div>
          </div>
        </ViewportOverlay>
      )}
    </SignInGate>
  );
}
