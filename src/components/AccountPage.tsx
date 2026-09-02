"use client";

import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";
import { useFeedback } from "@/components/FeedbackHost";
import { SignInAddresses } from "@/components/SignInAddresses";
import { SignInGate } from "@/components/SignInGate";
import { MobileDock } from "@/components/mobile/MobileDock";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CARD, Panel } from "@/components/ui/Panel";
import { Explain } from "@/components/ui/Explain";
import {
  PinnedHeader,
  SETTING_STACK,
  SettingBar,
} from "@/components/ui/setting-row";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { AVATAR_HOST_MESSAGE } from "@/lib/avatar-url";
import { cn } from "@/lib/format";
import {
  PAGE_FRAME_CLASS,
  PAGE_MAIN_CLASS,
} from "@/lib/page-shell";
import {
  LEGAL_OPERATOR,
  PRODUCT_NAME,
  PRODUCT_SUPPORT_EMAIL,
} from "@/lib/product";
import {
  SUPPORTER_ASIDE,
  SUPPORTER_OFFER,
  SUPPORTER_TITLE,
  describeAccountDeletion,
  holdingCountLabel,
  joinWords,
  nextSundayLetter,
  supporterButtonLabel,
  supporterIsActive,
  supporterThanks,
  tierChangeLine,
} from "@/lib/account-copy";
import { formatDateTime } from "@/lib/timezone";
import {
  ANALYTICS_CONSENT_EVENT,
  loadAnalyticsConsent,
  saveAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics-consent";
import { plainError } from "@/lib/plain-error";
import {
  last7Days,
  loadVisitStreak,
  streakFlavor,
  streakSentence,
  type VisitStreakState,
} from "@/lib/visit-streak";
import {
  EXPERIENCE_TIERS,
  loadStoredKnowsOptions,
  loadStoredTier,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { ACTIVE_STATUSES, subscriptionNeedsAttention } from "@/lib/billing-status";
import { requestWelcomeTour } from "@/lib/welcome-tour";
import { track } from "@vercel/analytics";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Compass,
  Download,
  Gauge,
  Heart,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTimeout } from "@/lib/use-timeout";
import { BelowFold } from "@/components/BelowFold";
import { useCallback, useEffect, useId, useState } from "react";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { toast } from "sonner";

/** "6 September", for the next charge. */
function dayAndMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return formatDateTime(when, { day: "numeric", month: "long" });
}

/**
 * "Sunday, 6 September", with the reader's own locale deciding the order.
 *
 * The weekday goes through the formatter rather than being typed in front
 * of it: "Sunday " plus "September 6" reads as a stutter, and the order of
 * the day and the month is not ours to choose.
 */
function weekdayDayMonth(when: Date): string {
  return formatDateTime(when, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * How often this device has been opened.
 *
 * Not a streak to protect. See the header of `visit-streak.ts` for why the
 * reward went and the count stayed: every line here ends by saying the
 * reader does not have to be here, because that is what the rest of the app
 * says and a card that quietly disagreed with it was the one thing on this
 * page arguing for a habit.
 */
function VisitCard() {
  const [streak] = useHydratedCache<VisitStreakState | null>(
    loadVisitStreak,
    null
  );
  if (!streak || streak.totalVisits <= 0) return null;
  const week = last7Days(streak);
  return (
    <Panel>
      <PinnedHeader
        icon={<CalendarCheck className="h-4 w-4" />}
        title="How often you look"
        subtitle={streakFlavor(streak.currentStreak)}
      />
      {/*
        Seven bare pills with a `title` on the row told a phone reader
        nothing, since a tooltip never appears on one. The letter under each
        pill says which day it is and which end is today.
      */}
      <div className="flex gap-2">
        {week.map((day) => (
          <div key={day.key} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-full rounded-full",
                day.visited ? "bg-primary" : "bg-accent"
              )}
            />
            <span
              className={cn(
                "text-xs",
                day.isToday
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {day.initial}
            </span>
          </div>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {streakSentence(streak)}
      </p>
    </Panel>
  );
}

type OwnedPortfolio = {
  id: string;
  name: string | null;
  holdings: number;
  owners: number;
};

export function AccountPage() {
  const router = useRouter();
  const { profile, user, signOut, refresh } = useAuth();
  const { openManual, openMonthly, snoozeMonthly, monthlyDue } = useFeedback();
  const later = useTimeout();
  const sundaySwitchId = useId();
  const analyticsSwitchId = useId();
  const deleteTitleId = useId();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showPhotoField, setShowPhotoField] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarBroken, setAvatarBroken] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportSaved, setExportSaved] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [tier, setTier] = useState<ExperienceTier | null>(loadStoredTier);
  const [knowsOptions, setKnowsOptions] = useState<boolean | null>(
    loadStoredKnowsOptions
  );
  const [noteSunday, setNoteSunday] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] =
    useState<AnalyticsConsent | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [subscriptionNext, setSubscriptionNext] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  /*
    What this account is made of, read once so two screens can be honest.

    The Sunday panel needs to know whether there is a single holding yet,
    because the letter genuinely does not start until there is one, and the
    delete dialog needs the portfolio names and their holding counts. Both
    used to guess: the switch promised an email that would never arrive, and
    the dialog explained in seventy words what it could have listed.
  */
  const [portfolios, setPortfolios] = useState<OwnedPortfolio[] | null>(null);
  const [circles, setCircles] = useState<string[]>([]);
  const [ownersKnown, setOwnersKnown] = useState(false);

  useEffect(() => {
    const sync = () => setAnalyticsConsent(loadAnalyticsConsent());
    sync();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
  }, []);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setAvatarBroken(false);
  }, [profile]);

  const readBilling = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/billing/status", { signal });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        subscriptionStatus?: string | null;
        plan?: string | null;
        currentPeriodEnd?: string | null;
      } | null;
      if (!data || signal?.aborted) return null;
      setSubscriptionStatus(data.subscriptionStatus ?? null);
      setSubscriptionNext(data.currentPeriodEnd ?? null);
      return data.subscriptionStatus ?? null;
    } catch {
      return null;
    }
  }, []);

  /*
    A RETURN FROM CHECKOUT IS BELIEVED BEFORE THE MIRROR IS.

    `subscriptionStatus` comes from the row the Stripe webhook writes, and
    the webhook has not necessarily landed by the time Stripe sends the
    reader back here. Read straight, that put a toast thanking somebody for
    subscribing directly over a card still asking them for twelve euros. So
    the query parameter counts as paid for this render and the page re-asks
    the billing route a few times over ten seconds before it believes a no.
  */
  useEffect(() => {
    // Plain browser API instead of useSearchParams() -- same reasoning as
    // SignInGate's deletedNotice: avoids a Suspense boundary for a one-time
    // post-checkout notice.
    if (new URLSearchParams(window.location.search).get("upgraded") !== "1") return;
    setJustPaid(true);
    toast.success("Thank you. You are a supporter now.");
    router.replace("/account", { scroll: false });
    let stop = false;
    const tries = [1500, 3500, 6000, 10000];
    for (const wait of tries) {
      later(() => {
        if (stop) return;
        void readBilling();
      }, wait);
    }
    return () => {
      stop = true;
    };
  }, [router, later, readBilling]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/account/experience-tier", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            tier?: ExperienceTier | null;
            knowsOptions?: boolean | null;
          } | null
        ) => {
          if (ctrl.signal.aborted) return;
          if (data?.tier) setTier(data.tier);
          if (typeof data?.knowsOptions === "boolean") {
            setKnowsOptions(data.knowsOptions);
          }
        }
      )
      .catch(() => {});
    void readBilling(ctrl.signal);
    void fetch("/api/account/weekly-note", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            sunday?: boolean;
            enabled?: boolean;
            canSend?: boolean;
          } | null
        ) => {
        if (ctrl.signal.aborted) return;
        if (typeof data?.sunday === "boolean") setNoteSunday(data.sunday);
        else if (typeof data?.enabled === "boolean") setNoteSunday(data.enabled);
        if (typeof data?.canSend === "boolean") {
          setEmailConfigured(data.canSend);
        }
        }
      )
      .catch(() => {});
    void fetch("/api/portfolios", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            portfolios?: { id: string; name?: string | null }[];
            holdings?: { portfolio_id?: string }[];
          } | null
        ) => {
          if (ctrl.signal.aborted || !data?.portfolios) return;
          const counts = new Map<string, number>();
          for (const h of data.holdings ?? []) {
            const id = h.portfolio_id;
            if (!id) continue;
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
          setPortfolios(
            data.portfolios.map((p) => ({
              id: p.id,
              name: p.name ?? null,
              holdings: counts.get(p.id) ?? 0,
              // Filled in when the delete dialog opens, never before: an
              // owners call per portfolio is not worth making on a page
              // nobody opened the dialog on.
              owners: 1,
            }))
          );
        }
      )
      .catch(() => {});
    void fetch("/api/communities", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { communities?: { name?: string | null }[] } | null) => {
        if (ctrl.signal.aborted || !data?.communities) return;
        setCircles(
          data.communities
            .map((c) => (c.name ?? "").trim())
            .filter((n) => n.length > 0)
        );
      })
      .catch(() => {});
    return () => {
      ctrl.abort();
    };
  }, [readBilling]);

  const handleTierChange = useCallback(async (next: ExperienceTier) => {
    setTier(next);
    saveStoredTier(next);
    try {
      await postJsonOrQueue("/api/account/experience-tier", { tier: next });
      track("experience_tier_set", { tier: next, source: "account" });
    } catch {
      /* localStorage already has it */
    }
  }, []);

  const handleKnowsOptionsChange = useCallback(async (next: boolean) => {
    setKnowsOptions(next);
    saveStoredKnowsOptions(next);
    try {
      await postJsonOrQueue("/api/account/experience-tier", {
        knowsOptions: next,
      });
      track("experience_tier_set", { knowsOptions: next, source: "account" });
    } catch {
      /* localStorage already has it */
    }
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErr(null);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't save your profile."));
      setProfileMsg("Saved.");
      await refresh();
      later(() => setProfileMsg(null), 4000);
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setExportErr(null);
    setExportSaved(null);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(plainError(data.error, "Couldn't download your data."));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const name = `upside-export-${new Date().toISOString().slice(0, 10)}.json`;
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      /*
        The button used to go back to saying "Export" and nothing else was
        said, so a reader who did not notice the download shelf had no way
        to know whether anything had happened.
      */
      setExportSaved(name);
      later(() => setExportSaved(null), 8000);
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : "Couldn't download your data.");
    } finally {
      setExporting(false);
    }
  }

  /*
    Who else is on each portfolio, asked only when the dialog opens.

    The delete route keeps a portfolio somebody else co-owns and deletes one
    only this reader owns, so the dialog cannot list the two apart without
    this. Nothing is listed until the answer is in: guessing here would put
    somebody's shared portfolio in a list of things about to be destroyed.
  */
  const loadOwners = useCallback(async () => {
    if (!portfolios || portfolios.length === 0) {
      setOwnersKnown(true);
      return;
    }
    try {
      const counted = await Promise.all(
        portfolios.map(async (p) => {
          const res = await fetch(`/api/portfolios/${p.id}/owners`);
          if (!res.ok) return p;
          const data = (await res.json()) as { owners?: unknown[] };
          return { ...p, owners: Math.max(1, data.owners?.length ?? 1) };
        })
      );
      setPortfolios(counted);
      setOwnersKnown(true);
    } catch {
      setOwnersKnown(false);
    }
  }, [portfolios]);

  async function joinWithCode(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCode.trim();
    if (!code || joining) return;
    setJoining(true);
    setJoinErr(null);
    try {
      const res = await fetch("/api/portfolios/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(plainError(data.error, "Couldn't join with that code."));
      }
      track("portfolio_invite_redeemed");
      router.push("/");
    } catch (err) {
      setJoinErr(
        err instanceof Error ? err.message : "Couldn't join with that code."
      );
      setJoining(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't delete your account."));
      await signOut();
      router.push(data.authDeleted ? "/?accountDeleted=full" : "/?accountDeleted=data");
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "Couldn't delete your account.");
      setDeleting(false);
    }
  }

  const isSupporter = supporterIsActive({
    status: subscriptionStatus,
    justPaid,
    activeStatuses: ACTIVE_STATUSES,
  });
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const googlePhoto =
    typeof meta.avatar_url === "string"
      ? meta.avatar_url
      : typeof meta.picture === "string"
        ? meta.picture
        : null;
  const signedInWithGoogle =
    (user?.app_metadata as { provider?: string } | undefined)?.provider ===
    "google";
  const holdingsTotal = (portfolios ?? []).reduce(
    (sum, p) => sum + p.holdings,
    0
  );
  const nextLetter = weekdayDayMonth(nextSundayLetter(new Date()));
  const deletion = describeAccountDeletion({
    portfolios: portfolios ?? [],
    circles,
    supporterActive: isSupporter,
  });

  const COLUMN = "flex min-w-0 flex-col gap-5 sm:gap-6";

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileDock active={null} />
        {/*
          No sign out in the header children.

          Those render only inside the `hidden md:block` desktop row, so on
          a phone, on the one page anybody would look for it, there was no
          way to sign out at all; on a laptop it was the first, loudest
          control on the page, ahead of the room navigation. It is a row in
          the identity panel now, at both widths.
        */}
        <AppHeader title="Account" />

        <main id="main" className={PAGE_MAIN_CLASS}>
          <div>
            <h1 className="text-2xl font-semibold">My account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Who you are, how much of the app you see, and where your data
              goes.
            </p>
          </div>

          <WidgetErrorBoundary name="Account">
          {/*
            ELEVEN FULL-WIDTH STRIPS BECOME A SPINE AND A RAIL.

            At 1280 every panel was 1,152px wide holding a title, one
            sentence and a button, so the settings read as a column of
            banners two and a half thousand pixels long. The settings a
            person came to change are the spine; help, the supporter offer
            and the visit count are things to notice rather than things to
            do, so they sit in a rail beside them. On a phone it is one
            column in this order, which is also the order of importance.
          */}
          <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className={cn(COLUMN, "lg:col-start-1 lg:row-start-1")}>
              {/*
                WHO YOU ARE, FIRST.

                This page used to open with a feedback form, a help
                paragraph and a request for twelve euros, and the reader's
                own name and email started 1,446px down a phone under a
                panel called "Community profile". The one question an
                account page answers before any other is which account you
                are in, which is the exact confusion the one-account-many-
                mailboxes feature exists to fix.
              */}
              <Panel>
                <PinnedHeader
                  icon={<UserRound className="h-4 w-4" />}
                  title="You"
                  subtitle={
                    user?.email
                      ? signedInWithGoogle
                        ? `${user.email}. Signed in with Google.`
                        : user.email
                      : "Demo. Nothing you change here is saved."
                  }
                />

                <form
                  onSubmit={(e) => void saveProfile(e)}
                  className="flex flex-col gap-4"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="size-12 shrink-0">
                      {avatarUrl && !avatarBroken ? (
                        <AvatarImage
                          src={avatarUrl}
                          alt=""
                          onError={() => setAvatarBroken(true)}
                        />
                      ) : null}
                      <AvatarFallback>
                        {(displayName || user?.email || "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {/*
                      Asking a beginner to paste an image address is
                      developer work handed to the reader, and the app
                      already copied their Google photo when they signed in.
                      The two buttons cover what nearly everybody wants; the
                      address field waits behind a link for the one person
                      who wants something else.
                    */}
                    <div className="flex min-w-0 flex-wrap gap-2">
                      {googlePhoto && googlePhoto !== avatarUrl ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAvatarUrl(googlePhoto);
                            setAvatarBroken(false);
                          }}
                        >
                          Use my Google photo
                        </Button>
                      ) : null}
                      {avatarUrl ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAvatarUrl("");
                            setAvatarBroken(false);
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPhotoField((on) => !on)}
                      >
                        {showPhotoField ? "Never mind" : "Use a different picture"}
                      </Button>
                    </div>
                  </div>

                  {showPhotoField ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">
                        Photo link
                      </span>
                      <Input
                        value={avatarUrl}
                        onChange={(e) => {
                          setAvatarUrl(e.target.value);
                          setAvatarBroken(false);
                        }}
                        placeholder="https://…"
                      />
                      <span className="text-sm text-muted-foreground">
                        {AVATAR_HOST_MESSAGE} Everyone who can see your
                        profile loads this picture, so it only comes from
                        those two places.
                      </span>
                    </label>
                  ) : null}
                  {avatarBroken && (
                    <span className="text-sm text-loss">
                      Couldn&apos;t load that picture, showing your initial
                      instead.
                    </span>
                  )}

                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">
                      Your name
                    </span>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">
                        A line about you, shown in your circles
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {bio.length}/280
                      </span>
                    </span>
                    <Textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={280}
                      rows={3}
                      placeholder="e.g. Long-term investor, two children, Tallinn"
                      className="resize-none"
                    />
                  </label>
                  {profileErr && (
                    <p className="text-sm text-loss">{profileErr}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? "Saving …" : "Save profile"}
                    </Button>
                    {/*
                      One line, in height reserved for it. Three panels used
                      to inject a green "Saved." for two seconds and push
                      everything under them down by a row.
                    */}
                    <span
                      aria-live="polite"
                      className="min-h-5 text-sm text-gain"
                    >
                      {profileMsg}
                    </span>
                  </div>
                </form>

                <SettingBar
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void signOut().then(() => {
                          router.push("/");
                        })
                      }
                    >
                      <LogOut data-icon="inline-start" />
                      Sign out
                    </Button>
                  }
                  description="You stay signed in on your other devices."
                >
                  <span className="block truncate font-medium">
                    Signed in on this device
                  </span>
                </SettingBar>
              </Panel>

              {/* Every mailbox that reaches this one account. */}
              <SignInAddresses />

              {/*
                An invite is redeemed here rather than at an address.

                This used to be a whole panel whose content was that
                inviting somebody happens somewhere else, with the raw path
                "/account/join" printed as the link text, which a beginner
                reads as an address rather than as something to press.
              */}
              <Panel>
                <PinnedHeader
                  icon={<Mail className="h-4 w-4" />}
                  title="Have an invite code?"
                  subtitle="Paste it here and you are added to that portfolio. To invite somebody yourself, open a portfolio and press Invite next to Add holding."
                />
                <form
                  onSubmit={(e) => void joinWithCode(e)}
                  className="flex max-w-md flex-col gap-2 sm:flex-row"
                >
                  <Input
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value);
                      setJoinErr(null);
                    }}
                    placeholder="Paste invite code"
                    className="sm:flex-1"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={joining}
                    className="shrink-0"
                  >
                    {joining ? "Joining …" : "Join"}
                  </Button>
                </form>
                {joinErr && <p className="text-sm text-loss">{joinErr}</p>}
              </Panel>

              {/* Experience level */}
              <Panel>
                <PinnedHeader
                  icon={<Gauge className="h-4 w-4" />}
                  title="How much to show"
                  subtitle="Nothing is locked away and nothing is lost, and you can change this whenever you like."
                />
                {/*
                  Three full-width slabs carrying ten words each spent 500px
                  of a laptop on a three-way choice and never said what any
                  of them changed. The second line is computed from the
                  gates themselves, so somebody moving a room between tiers
                  cannot leave this page describing the old arrangement.
                */}
                <div className="grid gap-2 sm:grid-cols-3">
                  {EXPERIENCE_TIERS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void handleTierChange(t.id)}
                      className={cn(
                        CARD,
                        "flex w-full flex-col gap-1 px-3.5 py-3 text-left text-sm text-foreground transition hover:bg-hover",
                        tier === t.id && "ring-1 ring-primary/40"
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "font-medium",
                            tier === t.id && "text-primary"
                          )}
                        >
                          {t.label}
                        </span>
                        {tier === t.id && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </span>
                      <span className="text-sm leading-relaxed text-muted-foreground">
                        {tierChangeLine(t.id)}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-5">
                  {/*
                    The walkthrough's own question, word for word.

                    The heading was "Options experience" over two answers
                    reading "Yes / Show covered calls" and "No / Hide
                    options entirely", which asks somebody to answer a
                    question the screen never put to them, using three terms
                    it never explained.
                  */}
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-foreground">
                      Have you used{" "}
                      <Explain term="covered-call">covered calls</Explain> or
                      other options?
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      An option is a side deal about a share, made with
                      somebody else. Most people never use one, and the app
                      is complete without them. This is a separate question
                      from the one above.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void handleKnowsOptionsChange(true)}
                      className={cn(
                        CARD,
                        "px-3.5 py-3 text-left text-sm text-foreground transition hover:bg-hover",
                        knowsOptions === true && "ring-1 ring-primary/40"
                      )}
                    >
                      <span
                        className={cn(
                          "font-medium",
                          knowsOptions === true && "text-primary"
                        )}
                      >
                        Yes, show them
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                        Covered calls, the price to watch for and Call % stay
                        where they are.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleKnowsOptionsChange(false)}
                      className={cn(
                        CARD,
                        "px-3.5 py-3 text-left text-sm text-foreground transition hover:bg-hover",
                        knowsOptions === false && "ring-1 ring-primary/40"
                      )}
                    >
                      <span
                        className={cn(
                          "font-medium",
                          knowsOptions === false && "text-primary"
                        )}
                      >
                        No, hide that whole topic
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                        None of it appears anywhere, and Margus stops
                        bringing it up.
                      </span>
                    </button>
                  </div>
                </div>
              </Panel>

              {/* The Sunday email */}
              <Panel>
                <div className={SETTING_STACK}>
                  {emailConfigured ? (
                    <PinnedHeader
                      icon={<Mail className="h-4 w-4" />}
                      title="The Sunday email"
                      subtitle="One email a week. What your week did in money, what moved and why, and nothing else lands in your inbox."
                      controlId={sundaySwitchId}
                      actions={
                        <Switch
                          id={sundaySwitchId}
                          checked={noteSunday}
                          onCheckedChange={(next) => {
                            const prev = noteSunday;
                            setNoteSunday(next);
                            void postJsonOrQueue("/api/account/weekly-note", {
                              sunday: next,
                            })
                              .then((r) => {
                                if (r.ok) return;
                                setNoteSunday(prev);
                              })
                              .catch(() => {
                                setNoteSunday(prev);
                              });
                          }}
                        />
                      }
                    />
                  ) : (
                    /*
                      A dead switch explained as "Email is not set up on this
                      server yet" asks a reader to know what a server is and
                      why a control will not move. No switch at all, and one
                      sentence in their own words.
                    */
                    <PinnedHeader
                      icon={<Mail className="h-4 w-4" />}
                      title="The Sunday email"
                      subtitle={`The Sunday email is switched off on this copy of ${PRODUCT_NAME}, so there is nothing to turn on here.`}
                    />
                  )}
                </div>
                {emailConfigured && noteSunday ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {portfolios && holdingsTotal === 0
                      ? "It starts once there is at least one holding in a portfolio. Add one and the next letter has something to say."
                      : nextLetter
                        ? `Next one: ${nextLetter}.`
                        : null}
                  </p>
                ) : null}
              </Panel>

              {/*
                * THE TAIL OF THE SPINE WAITS.
                *
                * Measured at 390x800 the old page was 196 elements over 4.3
                * screens with 82.7% of them starting below the fold. The
                * order has changed but the shape has not: everything from
                * here down starts past 1,400px on a phone, and the two
                * panels are the least likely on the page to be what
                * somebody came for.
                *
                * Safe to withhold the mount because the page has no section
                * anchors (one `id`, on `main`) and every fetch lives in
                * this component's own effects rather than in a section, so
                * nothing loads later than it did.
                */}
              <BelowFold reserve={320} className={COLUMN}>
                {/* Data & privacy */}
                <Panel>
                  <PinnedHeader
                    icon={<ShieldCheck className="h-4 w-4" />}
                    title="Data and privacy"
                    subtitle="It is your data. Export it or delete it whenever you like."
                  />

                  <SettingBar
                    action={
                      <Switch
                        id={analyticsSwitchId}
                        checked={analyticsConsent === "allow"}
                        onCheckedChange={(next) =>
                          saveAnalyticsConsent(next ? "allow" : "deny")
                        }
                      />
                    }
                    description="Measures page views and how long pages take to load. The cookies that keep you signed in always run."
                  >
                    <label
                      htmlFor={analyticsSwitchId}
                      className="block cursor-pointer truncate font-medium"
                    >
                      Analytics
                    </label>
                  </SettingBar>

                  <SettingBar
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void exportData()}
                        disabled={exporting}
                      >
                        <Download data-icon="inline-start" />
                        {exporting ? "Preparing …" : "Export"}
                      </Button>
                    }
                    description={
                      exportSaved ? (
                        <p
                          role="status"
                          className="text-sm leading-relaxed text-gain"
                        >
                          Saved as {exportSaved}. Look in your downloads.
                        </p>
                      ) : (
                        "One file: your profile, your portfolios, your holdings and your notes."
                      )
                    }
                  >
                    <span className="block truncate font-medium">
                      Download everything
                    </span>
                  </SettingBar>
                  {exportErr && (
                    <Alert variant="destructive">
                      <AlertDescription>{exportErr}</AlertDescription>
                    </Alert>
                  )}
                </Panel>

              </BelowFold>
            </div>

            <div className={cn(COLUMN, "lg:col-start-2 lg:row-start-1 lg:row-span-2")}>
              {/*
                ONE PANEL, NOT TWO, AND THE SENTENCE SAID ONCE.

                Feedback was offered three times on this screen, and "a bug,
                something missing, something annoying" appeared in the card,
                in the modal's opening line and in the topic placeholder,
                with "every one of these gets read" in three places too.
              */}
              <Panel>
                <PinnedHeader
                  icon={<Compass className="h-4 w-4" />}
                  title="Help and feedback"
                  subtitle={`What ${PRODUCT_NAME} is, where everything lives, and the one thing it will never do: tell you to buy or sell.`}
                />
                <p className="text-sm leading-relaxed text-foreground">
                  {PRODUCT_NAME} gives you your whole portfolio in ordinary
                  sentences, and on the days it falls it tells you whether
                  anything actually changed at the companies you own. Most of
                  the time nothing has, and the fall was the whole market
                  having a bad week. Your broker holds the money and adds it
                  up. This is the part that says what happened.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      track("welcome_tour_replayed");
                      requestWelcomeTour();
                    }}
                  >
                    Show me around
                  </Button>
                  <Button type="button" variant="outline" onClick={openManual}>
                    Send feedback
                  </Button>
                </div>
                {/*
                  The four-question round used to open itself over whatever
                  room the reader had come for, 1.6 seconds after launch,
                  once a month. It waits here instead.
                */}
                {monthlyDue ? (
                  <div className={cn(CARD, "flex flex-col gap-3 p-3.5")}>
                    <p className="text-sm leading-relaxed text-foreground">
                      How has the last month been? Four questions, and you can
                      tap through them.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={openMonthly}>
                        Answer them
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={snoozeMonthly}
                      >
                        Not this month
                      </Button>
                    </div>
                  </div>
                ) : null}
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Anything the walkthrough does not answer, mail{" "}
                  <a
                    href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
                    className="underline hover:text-foreground"
                  >
                    {PRODUCT_SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              </Panel>

              {/*
                "Upgrade to Pro" promised more and the paragraph beside it
                said there is no more. There is no more: the subscription
                adds nothing to the app and is not going to, which is what
                the sign-in page tells a stranger and what this now tells
                somebody who has already signed up.
              */}
              <Panel>
                {/*
                  The button sits under the copy, not beside the title.
                  `PinnedHeader` truncates a title to keep its control on the
                  same row, and "Become a supporter" takes most of a 20rem
                  rail, so the panel was headed "Supp...".
                */}
                <PinnedHeader
                  icon={<Heart className="h-4 w-4" />}
                  title={SUPPORTER_TITLE}
                />
                {subscriptionNeedsAttention(subscriptionStatus) ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Your last payment did not go through. Update your card and
                    nothing else changes.
                  </p>
                ) : isSupporter ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {/*
                      No "since" date. The billing route returns the plan and
                      the end of the current period and nothing about when
                      the subscription started, and the account's own
                      creation date is a different fact wearing the same
                      shape. A wrong date in a thank-you is worse than no
                      date.
                    */}
                    {supporterThanks({
                      since: null,
                      nextCharge: dayAndMonth(subscriptionNext),
                    })}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {SUPPORTER_OFFER}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {SUPPORTER_ASIDE}
                    </p>
                  </div>
                )}
                <div>
                  <UpgradeButton
                    subscriptionStatus={subscriptionStatus}
                    label={supporterButtonLabel(isSupporter)}
                  />
                </div>
              </Panel>

              <VisitCard />
            </div>

            {/*
              The danger zone is last on every width.

              On a phone the rail's panels come after the settings spine, so
              a delete button placed at the end of the spine would sit in the
              middle of the page with help and the supporter offer under it.
              It gets its own row instead: bottom of the spine column on a
              laptop, bottom of the page on a phone.
            */}
            <div className={cn(COLUMN, "lg:col-start-1 lg:row-start-2")}>
              <BelowFold reserve={180} className={COLUMN}>
                <Panel tone="danger">
                  <PinnedHeader
                    icon={<AlertTriangle className="h-4 w-4" />}
                    iconTone="danger"
                    title="Delete my account"
                    titleClassName="text-destructive"
                    subtitle="Removes your profile, deletes the portfolios only you own, and takes you off any you share with someone else. This cannot be undone."
                    actions={
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          setDeleteErr(null);
                          setDeleteText("");
                          setOwnersKnown(false);
                          setDeleteOpen(true);
                          void loadOwners();
                        }}
                      >
                        <Trash2 data-icon="inline-start" />
                        Delete
                      </Button>
                    }
                  />
                </Panel>
              </BelowFold>
            </div>
          </div>

          {/*
            A centred pair of links sitting inside a settings card, between
            the export row and the card's bottom padding, read as a page
            footer that had lost its page. This is that page.
          */}
          <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{LEGAL_OPERATOR}</span>
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy policy
            </Link>
            <Link href="/terms" className="underline hover:text-foreground">
              Terms of service
            </Link>
          </footer>
          </WidgetErrorBoundary>
        </main>
      </div>

      {deleteOpen && (
        <ViewportOverlay
          className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClose={() => !deleting && setDeleteOpen(false)}
          ariaLabelledBy={deleteTitleId}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => !deleting && setDeleteOpen(false)}
          />
          <div className="scroll-host relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover ring-1 ring-destructive/30 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-xl sm:pb-6">
            <h3 id={deleteTitleId} className="text-base font-semibold text-loss">
              Delete your account?
            </h3>
            {/*
              A LIST OF WHAT GOES, BUILT FROM WHAT IS THERE.

              This was a seventy-word paragraph about co-owners and Google
              access that never once said which portfolios were about to be
              deleted, although the app knows their names and how much is in
              each of them. Nothing is listed until the owners call has
              answered, because guessing here would put somebody's shared
              portfolio into a list of things about to be destroyed.
            */}
            {ownersKnown ? (
              <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed">
                {deletion.deletes.length > 0 ? (
                  <div>
                    <p className="font-medium text-foreground">Deletes</p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      {deletion.deletes.map((p) => (
                        <li key={p.name}>
                          {p.name} ({holdingCountLabel(p.holdings)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    There is no portfolio here that only you own, so nothing
                    of anybody&apos;s is deleted.
                  </p>
                )}
                {deletion.handsOver.length > 0 && (
                  <p className="text-muted-foreground">
                    Keeps {joinWords(deletion.handsOver)}, which you share.
                    It stays with the person you share it with, and you come
                    off it.
                  </p>
                )}
                {deletion.leaves.length > 0 && (
                  <p className="text-muted-foreground">
                    Takes you out of {joinWords(deletion.leaves)}.
                  </p>
                )}
                {deletion.cancelsSupporter && (
                  <p className="text-muted-foreground">
                    Cancels your supporter subscription, so nothing is
                    charged again.
                  </p>
                )}
                <p className="text-muted-foreground">
                  Removes your sign-in, so this account cannot be used again.
                  If it cannot be removed from here, you can also take{" "}
                  {PRODUCT_NAME} off your Google account yourself.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => void exportData()}
                  disabled={exporting}
                >
                  <Download data-icon="inline-start" />
                  {exporting ? "Preparing …" : "Download a copy first"}
                </Button>
                {exportSaved && (
                  <p role="status" className="text-sm text-gain">
                    Saved as {exportSaved}. Look in your downloads.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Working out what this would remove …
              </p>
            )}
            <label className="mt-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">
                Type DELETE to confirm
              </span>
              {/*
                `aria-invalid` was hard-coded true, so a screen reader
                announced an error on an empty field the moment the dialog
                opened and the box was ringed red before anybody had typed.
              */}
              <Input
                autoFocus
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                aria-invalid={
                  deleteText.length > 0 && deleteText.trim() !== "DELETE"
                }
              />
            </label>
            {deleteErr && (
              <p className="mt-3 text-sm text-loss">{deleteErr}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void deleteAccount()}
                disabled={deleting || deleteText.trim() !== "DELETE"}
              >
                {deleting ? "Deleting …" : "Permanently delete"}
              </Button>
            </div>
          </div>
        </ViewportOverlay>
      )}
    </SignInGate>
  );
}
