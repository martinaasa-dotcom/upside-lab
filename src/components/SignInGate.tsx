"use client";

import { useAuth } from "@/components/AuthProvider";
import { DashboardLoading } from "@/components/DashboardLoading";
import { UpsideLogo } from "@/components/UpsideLogo";
import {
  InsightText,
  MicroLabel,
  Panel,
  Pill,
  Reading,
} from "@/components/ui/Panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/format";
import { BellRing, CheckCircle2, MessageCircle } from "lucide-react";
import {
  inviteFromLocation,
  inviteLandingCopy,
  type InviteLanding,
} from "@/lib/invite-landing";
import {
  PRODUCT_NAME,
  PRODUCT_SUPPORT_EMAIL,
  PRODUCT_SENTENCE,
  SIGNIN_POINTS,
  SIGNIN_WHO,
} from "@/lib/product";
import { SignedOutLanding } from "@/components/SignedOutLanding";
import { PAGE_FRAME_CLASS } from "@/lib/page-shell";
import { supabaseIsConfigured } from "@/lib/supabase/env";
import { useLoadingMessage } from "@/lib/use-loading-message";
import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
};

/**
 * Requires Google SSO when Supabase is configured.
 * Demo / no-Supabase local mode renders children immediately.
 */
export function SignInGate({ children }: Props) {
  const { ready, user, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Plain browser API instead of useSearchParams() — this page is statically
  // rendered, and useSearchParams() would force a Suspense boundary / opt it
  // into dynamic rendering just to show a one-time post-deletion notice.
  const [deletedNotice, setDeletedNotice] = useState<"full" | "data" | null>(
    null
  );
  const loadingMessage = useLoadingMessage();
  const [invite, setInvite] = useState<InviteLanding | null>(null);
  /**
   * GDPR Article 8 lets each member state set the digital-consent age
   * anywhere from 13 to 16, and this app is EU-facing. Rather than pick one
   * number for everyone or try to geolocate an age nobody can verify, the
   * gate follows how the account is being created:
   *
   * - A classroom invite is a school context: paper money, no payment, and
   *   a teacher between us and the child. 13 keeps the high-school product
   *   this was built for working.
   * - Anything else is self-serve signup with real portfolio data and a
   *   paid tier. 16 is the strictest member-state threshold, so it retires
   *   the per-country question entirely and costs almost no real users.
   *
   * It starts at 16 and only relaxes once a classroom invite has actually
   * resolved, so the strict default is what an unknown visitor sees.
   */
  const minAge = invite?.kind === "classroom" ? 13 : 16;
  const needsAuth = supabaseIsConfigured();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("signin") === "failed") {
      setErr("Google sign-in didn't finish. Try again.");
      url.searchParams.delete("signin");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}`
      );
    }
    const kind = url.searchParams.get("accountDeleted");
    if (kind === "full" || kind === "data") {
      setDeletedNotice(kind);
      url.searchParams.delete("accountDeleted");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}`
      );
    }

    const fromUrl = inviteFromLocation(url.pathname, url.search);
    if (!fromUrl) return;
    setInvite(fromUrl);
    if (fromUrl.kind === "sheet") return;
    const token = url.searchParams.get("token")?.trim();
    if (!token) return;
    const ctrl = new AbortController();
    void fetch(`/api/communities/join?token=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || ctrl.signal.aborted) return;
        const kind =
          data.kind === "classroom" ? "classroom" : "community";
        setInvite({
          kind,
          name: typeof data.name === "string" ? data.name : null,
        });
      })
      .catch(() => {
        /* keep the generic invite line */
      });
    return () => ctrl.abort();
  }, []);

  if (!needsAuth) return <>{children}</>;
  if (!ready) return <DashboardLoading message={loadingMessage} />;
  if (user) return <>{children}</>;

  async function onSignIn() {
    setErr(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    /*
     * `page-frame`, the same class every signed-in page uses, so this gets
     * the app's real ambient field: warm `--primary` off the top-left, blue
     * `--ambient-cool` off the bottom-right, sized in viewport units.
     *
     * It used to paint its own — two `rounded-full bg-primary/20
     * blur-[130px]` circles, one of them warm on the *right*, where the
     * field is supposed to be cool. That is why this page kept looking a
     * generation behind the rest of the app: every pass that improved the
     * glow improved `.page-frame::before`, and this screen was not using
     * it. Nothing here should hand-roll ambient light again.
     */
    <div
      className={cn(
        PAGE_FRAME_CLASS,
        // The page-length flowing field, but only for the landing. An
        // invite is one screen, and there the fixed corner lobes are right.
        !invite && "landing-field",
        "overflow-x-clip overflow-y-auto"
      )}
    >
      {!invite ? (
        <SignedOutLanding
          busy={busy}
          err={err}
          minAge={minAge}
          onSignIn={() => void onSignIn()}
          notice={
            deletedNotice ? (
              <Alert className="signin-rise-2 mt-8 max-w-md">
                <AlertDescription>
                  {deletedNotice === "full"
                    ? "Account deleted. Your data and sign-in are both gone."
                    : `Your ${PRODUCT_NAME} data has been deleted. Signing in again starts a brand-new account.`}
                </AlertDescription>
              </Alert>
            ) : undefined
          }
        />
      ) : (
      <main
        id="main"
        className="relative z-10 mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col justify-start px-6 py-[max(2.5rem,env(safe-area-inset-top))] pb-[max(3.5rem,env(safe-area-inset-bottom))] md:justify-center"
      >
        {/*
         * Both columns are sized to their content, and the pair is centred.
         *
         * The left column was `minmax(0,1fr)` while everything inside it is
         * capped at `max-w-lg` / `max-w-md`. On a wide screen the column
         * kept growing and the text did not, so the copy hugged the left
         * edge and left a hole the width of the difference before the card
         * started. Giving the column the same cap its content already has
         * removes the hole without moving either side's own measure.
         */}
        <div className="signin-rise grid items-center justify-center gap-10 md:grid-cols-[minmax(0,32rem)_minmax(0,21rem)] md:gap-12 lg:gap-16">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <UpsideLogo variant="icon" className="signin-rise-1 text-lg" />

            {deletedNotice && (
              <Alert className="signin-rise-2 mt-8 max-w-md">
                <AlertDescription>
                  {deletedNotice === "full"
                    ? "Account deleted. Your data and sign-in are both gone."
                    : `Your ${PRODUCT_NAME} data has been deleted. Signing in again starts a brand-new account.`}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col signin-rise-2 mt-10 max-w-lg gap-5">
              {invite && (
                <p className="text-sm font-medium text-muted-foreground">
                  Invite
                </p>
              )}
              {/* Solid --foreground, not a gradient fill. This was the last
                * `bg-clip-text` in the app; the fade to `foreground/70` was
                * the "gray-on-gray hero text" the first design review
                * flagged. It measured 19.26:1 -> 14.73:1 contrast, so it
                * was never actually illegible — it just reads as a hedge on
                * the one sentence that has to sound certain. */}
              <h1 className="text-balance font-heading text-2xl font-semibold text-foreground">
                {invite ? inviteLandingCopy(invite).title : PRODUCT_SENTENCE}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                {invite ? inviteLandingCopy(invite).detail : SIGNIN_WHO}
              </p>
            </div>

            <ul className="flex flex-col signin-rise-2 mt-9 max-w-md gap-4 text-left text-sm leading-relaxed text-muted-foreground">
              {SIGNIN_POINTS.map((line, i) => {
                const Icon = SIGNIN_POINT_ICONS[i] ?? BellRing;
                return (
                  <li key={line} className="flex items-start gap-3.5">
                    <span
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="pt-1.5">{line}</span>
                  </li>
                );
              })}
            </ul>

            <div className="signin-rise-3 mt-10 flex max-w-sm flex-col gap-2.5">
              <Button
                type="button"
                size="lg"
                disabled={busy}
                onClick={() => void onSignIn()}
                className="h-11 w-full gap-2.5 rounded-full text-base md:w-auto md:min-w-[17rem]"
              >
                {busy ? <Spinner data-icon="inline-start" /> : <GoogleMark />}
                {busy ? "Redirecting …" : "Continue with Google"}
              </Button>
            </div>

            {err && (
              <p className="mt-4 text-sm text-loss" role="alert">
                {err}
              </p>
            )}

            {/*
              * Age is asserted here, in the same sentence as Terms and
              * Privacy, rather than behind its own checkbox. A separate tick
              * box is a thing to get past, not a thing anyone reads, and it
              * put a dead "Continue" button in front of every new person.
              * `minAge` still varies (13 for a classroom invite, 16 for
              * self-serve — see the note where it is computed), so the
              * sentence states the number that actually applies to this
              * visitor rather than a generic one.
              */}
            <p className="signin-rise-4 mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
              By continuing you confirm you are {minAge} or older and agree to
              the{" "}
              <Link href="/terms" className="underline hover:text-muted-foreground">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-muted-foreground">
                Privacy policy
              </Link>
              . Not financial advice. Help:{" "}
              <a
                href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
                className="underline hover:text-muted-foreground"
              >
                {PRODUCT_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>

          <BookStill />
        </div>

        {/*
          * Everything below the hero exists for one reader: somebody who
          * followed a link, has never heard of this, and is deciding whether
          * to hand over what they own.
          *
          * The hero answers "what is it" and stops. That was the whole page,
          * so a stranger judged the product on two of the eight things it
          * does, with no answer to what it costs or what happens to their
          * holdings. Those are the next two questions in that order, every
          * time, and leaving them unanswered reads as something being kept
          * back rather than as brevity.
          *
          * An invite skips all of it. Somebody arriving on a named invite
          * already knows why they are here, and the hero swaps to that
          * story; a product tour underneath would talk over it.
          */}
      </main>
      )}
    </div>
  );
}

const SIGNIN_POINT_ICONS = [BellRing, MessageCircle] as const;


const SAMPLE_MOVERS = [
  { ticker: "RKLB", pct: "+6.8%", dollar: "+$3,640", up: true },
  { ticker: "AMZN", pct: "+1.4%", dollar: "+$720", up: true },
  { ticker: "MSFT", pct: "-0.6%", dollar: "-$180", up: false },
] as const;

/** Compact sample of a day that moved. Not a full-size Home panel. */
function BookStill() {
  return (
    <div className="relative md:-rotate-1 md:transition-transform md:duration-700 md:hover:rotate-0">
      {/*
       * One quiet warm lift behind the sample card, not a halo, and the
       * same one the hero uses. It went through two rounds here before it
       * moved into `.ambient-glow`: first it lost `-inset-8 ...
       * from-primary/25 via-primary/5 to-gain/10 opacity-90 blur-3xl`, a
       * 395x666px element at blur(64px) wearing gain green, which is a
       * financial signal and meant nothing here. Then it lost the two
       * stop ramp that replaced it, because a ramp with one stop in it
       * cannot cross this much near-black without banding. The account of
       * that is in `globals.css`.
       */}
      <div className="ambient-glow" aria-hidden />
      <Panel
        className="signin-rise-3 h-auto gap-4 p-4 relative overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-primary/15"
        aria-hidden
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="signin-live-dot" aria-hidden />
            <MicroLabel>
              Today&apos;s briefing
            </MicroLabel>
          </span>
          <Pill tone="neutral">Sample</Pill>
        </div>

        <div>
          <MicroLabel>Portfolio</MicroLabel>
          <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-foreground">
            $91,400
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-gain/15 px-2 py-1 text-sm font-semibold tabular-nums text-gain">
              Today +$4,180
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-sm font-semibold tabular-nums text-gain">
              All time +18%
            </span>
          </div>
        </div>

        {/*
         * Three columns, not two, and the figures line up.
         *
         * The percent and the dollar used to sit in one span separated by a
         * space, both in the same weight and colour, so `+6.8% +$3,640` read
         * as one run of characters and nothing lined up down the rows. They
         * are separate fixed-width `tabular-nums` columns now — the percent
         * carries the gain/loss colour because that is the figure a person
         * scans, and the money sits beside it in a quieter tone rather than
         * competing with it.
         *
         * `glass-well` rather than the opaque `bg-muted` this had, so the
         * ambient field reads through the sample the way it does through
         * every real well in the app.
         */}
        <div className="divide-y divide-border/60 overflow-hidden rounded-lg glass-well">
          {SAMPLE_MOVERS.map((row) => (
            <div
              key={row.ticker}
              className="flex h-10 items-center gap-3 px-3"
            >
              <span className="flex-1 font-heading text-sm font-semibold text-foreground">
                ${row.ticker}
              </span>
              <span
                className={cn(
                  "w-14 text-right font-mono text-sm font-medium tabular-nums",
                  row.up ? "text-gain" : "text-loss"
                )}
              >
                {row.pct}
              </span>
              <span className="w-16 text-right font-mono text-sm tabular-nums text-muted-foreground">
                {row.dollar}
              </span>
            </div>
          ))}
        </div>

        <Reading nested label="Worth noticing">
          {/*
           * Rewritten. The old line read "Check whether cheaper launches
           * still hold, or this is just a bounce" — "cheaper launches" was
           * a thesis nobody outside this example knows, and "a bounce" is
           * exactly the market slang AGENTS.md bans on anything a person
           * reads. It also asked the reader to check something without
           * saying why it mattered.
           *
           * This says the observation, then the reason it is worth a
           * second look, in words a grandmother gets.
           */}
          <InsightText text="$RKLB rose 6.8% today while Amazon and Microsoft barely moved. When one name climbs on its own, the question is whether something changed at the company, or whether the price just ran ahead of itself." />
        </Reading>

        <div className="rounded-lg bg-muted p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">$RKLB</span>
            <Badge variant="secondary">Up ≥5%</Badge>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Pill>Hold</Pill>
            <Pill tone="good">
              <CheckCircle2 className="size-3.5 text-gain" />
              Thesis intact
            </Pill>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-0.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
