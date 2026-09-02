"use client";

import { useAuth } from "@/components/AuthProvider";
import { UpsideLogo } from "@/components/UpsideLogo";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cn } from "@/lib/format";
import { Activity, MessageCircle, Users } from "lucide-react";
import {
  inviteFromLocation,
  inviteLandingCopy,
  type InviteLanding,
} from "@/lib/invite-landing";
import {
  PRODUCT_NAME,
  PRODUCT_SUPPORT_EMAIL,
  SIGNIN_POINTS,
} from "@/lib/product";
import {
  LOOK_AROUND_EVENT,
  SAMPLE_PORTFOLIO_NAME,
  isLookingAround,
  startLookingAround,
  stopLookingAround,
} from "@/lib/sample-portfolio";
import { SessionResumeShell } from "@/components/SessionResumeShell";
import { SampleBriefing, SignedOutLanding } from "@/components/SignedOutLanding";
import { SignInMethods } from "@/components/SignInMethods";
import { PAGE_FRAME_CLASS } from "@/lib/page-shell";
import { supabaseIsConfigured } from "@/lib/supabase/env";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
  /**
   * Invite routes pass this so the marketing landing never paints first.
   * Without it the gate starts at `null` and only reads the URL after
   * mount, which on `/communities/join` is a flash of the product page
   * then a swap to the invite.
   */
  invite?: InviteLanding | null;
};

/**
 * The addresses that get the compact sign-in rather than the product page.
 *
 * `/login` is where the Google route sends a handshake that broke, and it
 * used to answer with the full pitch under a tab titled "Sign in": a
 * returning reader whose sign-in failed got nine screens of marketing with
 * the red line about the failure buried under two unrelated grey captions,
 * about a hundred and forty pixels below the button they wanted. The
 * compact layout already existed for invites and was unreachable for a
 * plain sign-in.
 *
 * Decided here rather than by a prop from `/login/page.tsx`, because that
 * page is never drawn: `/login` is a book-room path, so `WorkspaceShell`
 * answers it with the book room, and the gate inside that room is this
 * one. The page file says so too.
 */
function compactSignIn(pathname: string): boolean {
  return (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "") === "/login";
}

/**
 * The rooms a look-around reader can actually open.
 *
 * Everything in the book runs on holdings, which the sample provides, so
 * every one of those rooms is real. Circle, the Fund, Account and Admin
 * are about an account, and there is no account, so they would draw a
 * screen of failed reads. Sending somebody there and showing them nothing
 * is worse than saying plainly that this part needs signing in.
 */
function lookAroundOpens(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "") || "/";
  if (path === "/") return true;
  return ["/pulse", "/lab", "/growth", "/alerts", "/portfolio"].some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
}

/**
 * Requires a session when Supabase is configured.
 * Demo / no-Supabase local mode renders children immediately.
 */
export function SignInGate({ children, invite: seededInvite = null }: Props) {
  const { user, signInWithGoogle } = useAuth();
  const pathname = usePathname();
  const compact = compactSignIn(pathname);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Plain browser API instead of useSearchParams() — this page is statically
  // rendered, and useSearchParams() would force a Suspense boundary / opt it
  // into dynamic rendering just to show a one-time post-deletion notice.
  const [deletedNotice, setDeletedNotice] = useState<"full" | "data" | null>(
    null
  );
  const [invite, setInvite] = useState<InviteLanding | null>(seededInvite);
  /**
   * Whether this browser has chosen to look around.
   *
   * Starts false on every render, server and client alike, and is corrected
   * in an effect. Reading `localStorage` during render would make the first
   * HTML disagree with the first hydration, and this gate is the one
   * component in the app where that costs the most: it decides between the
   * marketing page and the app.
   */
  const [looking, setLooking] = useState(false);
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
    const sync = () => setLooking(isLookingAround());
    sync();
    window.addEventListener(LOOK_AROUND_EVENT, sync);
    return () => window.removeEventListener(LOOK_AROUND_EVENT, sync);
  }, []);

  /*
    The mark the cookie question reads.

    Asking a stranger about performance measurement on the first screen of
    the product is the wrong moment and, measured at 390x844, the wrong
    place: the banner covered the sample card almost exactly, so what was
    left of the product on the first screen was ten pixels of card rim. The
    question is not dropped, it is deferred to a reader who has an account,
    where the walkthrough already has a switch for it.

    The mark is "there is no session here", not "the landing is drawn", so
    it stays on while somebody is looking around the sample: they have no
    account either, and the strip that says so is already the one thing
    pinned to the bottom of that screen.

    An attribute on the root element rather than a prop, because the banner
    is mounted from `Providers` and is nobody's child here. Same shape as
    `data-dock` and the session hint.
  */
  useEffect(() => {
    const root = document.documentElement;
    if (needsAuth && !user) root.setAttribute("data-signed-out", "");
    else root.removeAttribute("data-signed-out");
    return () => root.removeAttribute("data-signed-out");
  }, [needsAuth, user]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("signin") === "failed") {
      setErr("Sign-in didn't finish. Try again.");
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
  /*
   * A last-session stub is already `user` before paint (`useLayoutEffect`
   * in AuthProvider), so returning visitors skip the landing. Everybody
   * else used to wait on `getUser()` behind a spinner, which on a slow
   * iPhone is a blank screen, then the whole hero popping in. Show the
   * landing until a session is actually in hand.
   */
  if (user) return <>{children}</>;

  /*
    Looking around opens the real app on the sample portfolio.

    The rooms below draw their own holdings from the demo store, which
    `startLookingAround` has filled with the sample, so this is the product
    rather than a picture of it. The strip is always there and always says
    the same two things: these holdings are invented, the prices are not.
  */
  if (looking) {
    const opens = lookAroundOpens(pathname);
    return (
      <>
        {opens ? (
          children
        ) : (
          <div className={cn(PAGE_FRAME_CLASS)}>
            <main
              id="main"
              className="relative z-10 mx-auto flex w-full min-w-0 max-w-lg flex-1 flex-col justify-center gap-5 px-6 py-16 text-center"
            >
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                This part needs an account.
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                A circle is other people, and the Fund and your account
                settings are about you, so there is nothing to show somebody
                who has not signed in yet. The portfolio, Pulse, Lab and
                Growth are all open on the sample.
              </p>
              <div className="flex flex-col items-center gap-3">
                <Button asChild>
                  <Link href="/">Back to the sample portfolio</Link>
                </Button>
              </div>
            </main>
          </div>
        )}
        <LookAroundStrip
          busy={busy}
          onSignIn={() => void onSignIn()}
          onLeave={() => stopLookingAround()}
        />
      </>
    );
  }

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

  const compactCopy = invite
    ? inviteLandingCopy(invite)
    : {
        title: "Sign in to Upside Lab.",
        detail:
          "Add what you own and it tells you, in plain words, what happened at those companies each day.",
      };

  /*
   * Held in a variable rather than returned directly, because it is now
   * one of two things this can paint and the other one has to be its
   * sibling: `SessionResumeShell` is what a returning reader sees while
   * the bundle hydrates, and it cannot sit inside a subtree that CSS is
   * about to switch off. See `src/lib/session-hint.ts`.
   */
  const signedOutView = (
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
      data-signed-out-view
      className={cn(
        PAGE_FRAME_CLASS,
        // Paint-in-one-frame rules (no entrance animation, no phone
        // backdrop-filter on cards that hang off the fold). The lamps stay
        // the page-frame ones, fixed to the window. Do not make this a
        // scroll container: a y-auto overflow here either clips those lamps
        // to the first screen or stretches the SVG filter to the document.
        !invite && !compact && "landing-field"
      )}
    >
      {!invite && !compact ? (
        <SignedOutLanding
          busy={busy}
          err={err}
          minAge={minAge}
          onSignIn={() => void onSignIn()}
          onLookAround={() => startLookingAround()}
          notice={
            deletedNotice ? (
              <Alert className="mt-8 max-w-md">
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
                {compactCopy.title}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                {compactCopy.detail}
              </p>
            </div>

            <ul className="flex flex-col signin-rise-2 mt-9 max-w-md gap-4 text-left text-sm leading-relaxed text-muted-foreground">
              {SIGNIN_POINTS.map((line, i) => {
                const Icon = SIGNIN_POINT_ICONS[i] ?? Activity;
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
              {/*
                * The error goes with the button, not two captions below it.
                * `/login` is where every failed Google handshake lands, so
                * this is the one screen where that sentence is read most.
                */}
              {/*
                * An invite opens the field, because the whole point of
                * arriving on one is to act. A plain sign-in does not: on
                * `/login` that put an open form with a greyed-out submit
                * on the screen a failed handshake lands on, which reads as
                * something already broken. Two doors, both live.
                */}
              <SignInMethods
                googleBusy={busy}
                onGoogle={() => void onSignIn()}
                error={err}
                startWithEmail={Boolean(invite)}
                align="start"
              />
            </div>

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
              . {ADVICE_DISCLAIMER_SHORT} Help:{" "}
              <a
                href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
                className="underline hover:text-muted-foreground"
              >
                {PRODUCT_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>

          {/*
            * The one sample card, the same one the landing page draws.
            *
            * This used to be a second sample in this file: a different day,
            * a different portfolio total, a covered-call symbol pill nobody
            * outside the app has been introduced to, and arithmetic that
            * did not hold either. Two samples in two files had already
            * drifted apart, so there is one. The tilt went with it, since
            * the landing deliberately stopped tilting the thing it most
            * wants believed.
            */}
          <div className="signin-rise-3">
            <SampleBriefing />
          </div>
        </div>
      </main>
      )}
    </div>
  );

  return (
    <>
      {/*
       * Every route behind this gate is statically rendered with no user,
       * so the HTML a browser paints before hydration is the landing
       * below. For a reader who is already signed in that is the wrong
       * page, and on a cold bundle it is on screen long enough to read.
       * This shell is the same loading state `Dashboard` shows a moment
       * later, and CSS picks between the two from a mark the root element
       * is already carrying by then.
       */}
      <SessionResumeShell />
      {signedOutView}
    </>
  );
}

/*
  One icon per point, and the pairing is checked by a test.

  This was `[BellRing, MessageCircle]` against two points, and then a third
  point about Circle was added to `product.ts` without anybody touching
  this line. The lookup below falls back rather than failing, so what
  shipped was a bell beside a sentence about the people you share a
  portfolio with: wrong, and silent, which is the worse half. The fallback
  stays, because a missing icon should never blank the page, and
  `signin-points.test.ts` now fails when the two lists disagree so the
  fallback cannot be what a reader actually gets.
*/
const SIGNIN_POINT_ICONS = [Activity, MessageCircle, Users] as const;

/**
 * The one thing on screen that a look-around reader must never lose.
 *
 * It says both halves of the truth every time: the holdings are made up,
 * the prices are real. A demo that looks exactly like the product is only
 * honest while it keeps saying which one you are in.
 *
 * `.bottom-notice` rather than a typed offset, so it clears whatever is
 * actually drawn down there. It carries no `backdrop-filter` of its own
 * beyond `glass-overlay`, which is what every notice pinned over content
 * in this app uses.
 */
function LookAroundStrip({
  busy,
  onSignIn,
  onLeave,
}: {
  busy: boolean;
  onSignIn: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      className="bottom-notice fixed z-50 left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] sm:left-1/2 sm:right-auto sm:w-[34rem] sm:-translate-x-1/2"
      role="region"
      aria-label="Sample portfolio"
    >
      {/*
        * Two lines and two small buttons, because this is pinned over the
        * product on a phone and every pixel of it is a pixel of somebody's
        * portfolio. "Sign in to use what you own" was a third sentence
        * saying what the button beside it already says.
        */}
      <div className="flex flex-col gap-2.5 rounded-xl glass-overlay ring-1 ring-foreground/20 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
          {SAMPLE_PORTFOLIO_NAME}: the holdings are made up and the prices
          are real.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onSignIn}>
            Sign in
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onLeave}
          >
            Leave the sample
          </Button>
        </div>
      </div>
    </div>
  );
}
