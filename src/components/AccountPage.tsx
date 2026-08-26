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
import { CARD, Panel, PanelHeader } from "@/components/ui/Panel";
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { NO_VALUE, cn } from "@/lib/format";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { PRODUCT_NAME, PRODUCT_SUPPORT_EMAIL } from "@/lib/product";
import {
  ANALYTICS_CONSENT_EVENT,
  loadAnalyticsConsent,
  saveAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics-consent";
import { plainError } from "@/lib/plain-error";
import {
  last7DaysStrip,
  loadVisitStreak,
  streakFlavor,
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
import { requestWelcomeTour } from "@/lib/welcome-tour";
import { track } from "@vercel/analytics";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import {
  AlertTriangle,
  Check,
  Compass,
  Download,
  Gauge,
  Link2,
  LogOut,
  MessageSquare,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTimeout } from "@/lib/use-timeout";
import { useCallback, useEffect, useId, useState } from "react";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { isActiveSubscription, subscriptionNeedsAttention } from "@/lib/billing-status";
import { toast } from "sonner";

function VisitStreakCard() {
  const [streak] = useHydratedCache<VisitStreakState | null>(
    loadVisitStreak,
    null
  );
  if (!streak || streak.totalVisits <= 0) return null;
  return (
    <Panel>
      <PanelHeader title="Showing up" subtitle={streakFlavor(streak.currentStreak)} />
      <div className="flex gap-1" title="Your last seven days">
        {last7DaysStrip(streak).map((visited, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-6 rounded-full",
              visited ? "bg-primary" : "bg-accent"
            )}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {streak.currentStreak} day streak - best {streak.longestStreak} -{" "}
        {streak.totalVisits} visits on this device
      </p>
    </Panel>
  );
}

export function AccountPage() {
  const router = useRouter();
  const { profile, user, signOut, refresh } = useAuth();
  const { openManual } = useFeedback();
  const later = useTimeout();
  const sundaySwitchId = useId();
  const analyticsSwitchId = useId();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarBroken, setAvatarBroken] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [tier, setTier] = useState<ExperienceTier | null>(loadStoredTier);
  const [tierSaved, setTierSaved] = useState(false);
  const [knowsOptions, setKnowsOptions] = useState<boolean | null>(
    loadStoredKnowsOptions
  );
  const [knowsOptionsSaved, setKnowsOptionsSaved] = useState(false);
  const [noteSunday, setNoteSunday] = useState(false);
  const [weeklySaved, setWeeklySaved] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] =
    useState<AnalyticsConsent | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

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

  useEffect(() => {
    // Plain browser API instead of useSearchParams() -- same reasoning as
    // SignInGate's deletedNotice: avoids a Suspense boundary for a one-time
    // post-checkout notice.
    if (new URLSearchParams(window.location.search).get("upgraded") !== "1") return;
    toast.success("You're on Upside Lab Pro now.");
    router.replace("/account", { scroll: false });
  }, [router]);

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
    void fetch("/api/billing/status", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { subscriptionStatus?: string | null } | null) => {
        if (ctrl.signal.aborted) return;
        if (data && "subscriptionStatus" in data) {
          setSubscriptionStatus(data.subscriptionStatus ?? null);
        }
      })
      .catch(() => {});
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
    return () => {
      ctrl.abort();
    };
  }, []);

  const handleTierChange = useCallback(async (next: ExperienceTier) => {
    setTier(next);
    saveStoredTier(next);
    setTierSaved(false);
    try {
      await postJsonOrQueue("/api/account/experience-tier", { tier: next });
      setTierSaved(true);
      track("experience_tier_set", { tier: next, source: "account" });
      later(() => setTierSaved(false), 2000);
    } catch {
      /* localStorage already has it */
    }
  }, [later]);

  const handleKnowsOptionsChange = useCallback(async (next: boolean) => {
    setKnowsOptions(next);
    saveStoredKnowsOptions(next);
    setKnowsOptionsSaved(false);
    try {
      await postJsonOrQueue("/api/account/experience-tier", {
        knowsOptions: next,
      });
      setKnowsOptionsSaved(true);
      track("experience_tier_set", { knowsOptions: next, source: "account" });
      later(() => setKnowsOptionsSaved(false), 2000);
    } catch {
      /* localStorage already has it */
    }
  }, [later]);

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
      setProfileMsg("Saved. This is how you appear in communities.");
      await refresh();
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(plainError(data.error, "Couldn't download your data."));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `upside-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : "Couldn't download your data.");
    } finally {
      setExporting(false);
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

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileDock active={null} />
        <AppHeader title="Account">
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
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </AppHeader>

        <main id="main" className={PAGE_MAIN_CLASS}>
          <div>
            <h1 className="text-2xl font-semibold">My account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              How you appear, your data, and the danger zone.
            </p>
          </div>

          <WidgetErrorBoundary name="Account">
          <Panel>
            <PinnedHeader
              icon={<MessageSquare className="h-4 w-4" />}
              title="Feedback"
              subtitle="A bug, a missing thing, or a rant. Upside reads these."
              actions={
                <Button type="button" onClick={openManual}>
                  Tell Upside
                </Button>
              }
            />
          </Panel>

          <Panel>
            <PinnedHeader
              icon={<Compass className="h-4 w-4" />}
              title="Help"
              subtitle={`What ${PRODUCT_NAME} is, where everything lives, and what none of it is.`}
              actions={
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
              }
            />
            <p className="text-sm text-muted-foreground">
              The walkthrough is the same one you got on your first visit, and
              you can leave it at any point. If it does not answer something, and
              it is a question about the app rather than a data request, mail{" "}
              <a
                href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
                className="underline hover:text-foreground"
              >
                {PRODUCT_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </Panel>

          <Panel>
            <PinnedHeader
              title="Billing"
              actions={
                <UpgradeButton subscriptionStatus={subscriptionStatus} />
              }
            />
            {subscriptionNeedsAttention(subscriptionStatus) ? (
              <p className="text-sm text-muted-foreground">
                Your last payment didn&apos;t go through. Update your card to keep Pro.
              </p>
            ) : isActiveSubscription(subscriptionStatus) ? (
              <p className="text-sm text-muted-foreground">
                Your subscription is active. Manage your card, invoices, or cancel anytime.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">
                  Upgrading to Pro gets you nothing new (literally, not a
                  single feature), but it does come with the smell of fresh
                  coffee in the morning, flipping to the cool side of the
                  pillow, and a small army of imaginary puppies.
                </p>
                <p className="text-sm text-muted-foreground">
                  On a serious note, it&apos;s twelve euros a month to
                  directly support Upside making this. Pretty solid deal.
                </p>
              </div>
            )}
          </Panel>

          <VisitStreakCard />

          <Panel>
            <div className={SETTING_STACK}>
              <PinnedHeader
                title="The Sunday email"
                subtitle={
                  emailConfigured
                    ? "One email a week, on Sunday. Nothing else lands in your inbox."
                    : "Email is not set up on this server yet."
                }
                controlId={sundaySwitchId}
                actions={
                  <Switch
                    id={sundaySwitchId}
                    checked={noteSunday}
                    disabled={!emailConfigured}
                    onCheckedChange={(next) => {
                      const prev = noteSunday;
                      setNoteSunday(next);
                      void postJsonOrQueue("/api/account/weekly-note", {
                        sunday: next,
                      })
                        .then((r) => {
                          if (r.ok) {
                            setWeeklySaved(true);
                            later(() => setWeeklySaved(false), 2000);
                            return;
                          }
                          setNoteSunday(prev);
                        })
                        .catch(() => {
                          setNoteSunday(prev);
                        });
                    }}
                  />
                }
              />
              {weeklySaved ? <p className="text-sm text-gain">Saved.</p> : null}
            </div>
          </Panel>

          {/* Profile / community appearance */}
          <Panel>
            <PanelHeader
              icon={<UserRound className="h-4 w-4" />}
              title="Community profile"
              subtitle={`Signed in as ${user?.email ?? NO_VALUE}`}
            />

            <Item className="px-0">
              <ItemMedia>
                <Avatar className="size-12">
                  {avatarUrl && !avatarBroken ? (
                    <AvatarImage
                      src={avatarUrl}
                      alt=""
                      onError={() => setAvatarBroken(true)}
                    />
                  ) : null}
                  <AvatarFallback>
                    {(displayName || "?").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{displayName || "Your name"}</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {bio || "Add a short bio for the community scoreboard."}
                </ItemDescription>
              </ItemContent>
            </Item>

            <form onSubmit={(e) => void saveProfile(e)} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  Display name
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
                    Bio - communities
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
                  placeholder={
                    knowsOptions === true
                      ? "e.g. Long-term tech · covered calls · Tallinn"
                      : "e.g. Long-term tech · growth investor · Tallinn"
                  }
                  className="resize-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  Avatar URL (optional)
                </span>
                <Input
                  value={avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setAvatarBroken(false);
                  }}
                  placeholder="https://…"
                />
                {avatarBroken && (
                  <span className="text-sm text-loss">
                    Couldn&apos;t load that image, showing your initial instead.
                  </span>
                )}
              </label>
              {profileErr && (
                <p className="text-sm text-loss">{profileErr}</p>
              )}
              {profileMsg && (
                <p className="text-sm text-gain">{profileMsg}</p>
              )}
              <Button type="submit" disabled={savingProfile} className="self-start">
                {savingProfile ? "Saving …" : "Save profile"}
              </Button>
            </form>
          </Panel>

          {/* Every mailbox that reaches this one account. */}
          <SignInAddresses />

          {/* Experience level */}
          <Panel>
            <PanelHeader
              icon={<Gauge className="h-4 w-4" />}
              title="Experience level"
              subtitle="Simplifies what's shown. Nothing is locked, change it anytime."
            />
            <div className="flex flex-col gap-2">
              {EXPERIENCE_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void handleTierChange(t.id)}
                  className={cn(
                    CARD,
                    "flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm text-foreground transition hover:bg-hover",
                    tier === t.id && "ring-1 ring-primary/40"
                  )}
                >
                  <span>
                    <span className={cn("font-medium", tier === t.id && "text-primary")}>
                      {t.label}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{t.blurb}</span>
                  </span>
                  {tier === t.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
              {tierSaved && <p className="text-sm text-gain">Saved.</p>}
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">Options experience</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Controls covered calls, strike alerts, and Call % everywhere.
                Separate from the level above.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleKnowsOptionsChange(true)}
                  className={cn(
                    CARD,
                    "px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-hover",
                    knowsOptions === true && "ring-1 ring-primary/40"
                  )}
                >
                  <span className={cn("font-medium", knowsOptions === true && "text-primary")}>
                    Yes
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    Show covered calls
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleKnowsOptionsChange(false)}
                  className={cn(
                    CARD,
                    "px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-hover",
                    knowsOptions === false && "ring-1 ring-primary/40"
                  )}
                >
                  <span className={cn("font-medium", knowsOptions === false && "text-primary")}>
                    No
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    Hide options entirely
                  </span>
                </button>
              </div>
              {knowsOptionsSaved && <p className="mt-2 text-sm text-gain">Saved.</p>}
            </div>
          </Panel>

          {/* Sheet invites live next to the sheet, not here. */}
          <Panel>
            <PanelHeader
              icon={<Link2 className="h-4 w-4" />}
              title="Invite a partner"
              subtitle="That lives on the portfolio now. Open a portfolio, tap Invite next to Add holding."
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Redeem a code at{" "}
              <Link href="/account/join" className="text-foreground underline">
                /account/join
              </Link>
              .
            </p>
          </Panel>

          {/* Data & privacy */}
          <Panel>
            <PanelHeader
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Data & privacy"
              subtitle="Your data, your call. Export it or wipe it any time."
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
              description="Measure page views and load times. Sign-in cookies always run."
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
              description="One JSON file: profile, portfolios, holdings, Lab state."
            >
              <span className="block truncate font-medium">Download everything</span>
            </SettingBar>
            {exportErr && (
              <Alert variant="destructive">
                <AlertDescription>{exportErr}</AlertDescription>
              </Alert>
            )}

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/privacy" className="underline hover:text-muted-foreground">
                Privacy policy
              </Link>
              {" · "}
              <Link href="/terms" className="underline hover:text-muted-foreground">
                Terms of service
              </Link>
            </p>
          </Panel>

          {/* Danger zone */}
          <Panel tone="danger">
            <PinnedHeader
              icon={<AlertTriangle className="h-4 w-4" />}
              iconTone="danger"
              title="Delete my account"
              titleClassName="text-destructive"
              subtitle="Removes your profile, deletes portfolios only you own, and steps you off any shared ones. Cannot be undone."
              actions={
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setDeleteErr(null);
                    setDeleteText("");
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              }
            />
          </Panel>
          </WidgetErrorBoundary>
        </main>
      </div>

      {deleteOpen && (
        <ViewportOverlay
          className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClose={() => !deleting && setDeleteOpen(false)}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => !deleting && setDeleteOpen(false)}
          />
          <div className="scroll-host relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover ring-1 ring-destructive/30 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-xl sm:pb-6">
            <h3 className="text-base font-semibold text-loss">
              Delete your account?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This permanently deletes your profile and any portfolio
              you&apos;re the sole owner of (holdings included). Shared
              portfolios stay for
              your co-owner. Where possible this also removes your sign-in
              itself, so the account can&apos;t be used again; if it can&apos;t
              be removed from here, revoke Upside Lab&apos;s access from your
              Google account separately if you want that severed too.
            </p>
            <label className="mt-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">
                Type DELETE to confirm
              </span>
              <Input
                autoFocus
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                aria-invalid
                className="border-destructive"
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
