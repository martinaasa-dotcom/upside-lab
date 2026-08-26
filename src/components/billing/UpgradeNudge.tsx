"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isActiveSubscription } from "@/lib/billing-status";
import { plainError } from "@/lib/plain-error";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

const STATUS_CACHE_KEY = "upside-billing-status";

/** Last known billing status, so the header renders its final shape on
 * the first frame instead of re-flowing when the fetch lands. */
function readCachedStatus(): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STATUS_CACHE_KEY);
    if (raw === null) return undefined;
    return raw === "" ? null : raw;
  } catch {
    return undefined;
  }
}

function writeCachedStatus(status: string | null): void {
  try {
    window.localStorage.setItem(STATUS_CACHE_KEY, status ?? "");
  } catch {
    /* private mode / storage disabled — the fetch still drives the UI */
  }
}

/**
 * Whether this viewer should be offered Pro, resolved once for whoever
 * asks.
 *
 * Split out of `UpgradeNudge` because the offer now has two shapes: the
 * desktop header's pill, and a row in the phone's overflow menu. Both need
 * the same answer and neither should run its own fetch.
 *
 * `pending` is the genuinely first-ever load, where there is no cached
 * answer to render from. The pill holds its own space in that case rather
 * than collapsing it; a menu row simply waits, because a menu that is
 * closed cannot re-flow.
 */
export function useUpgradeOffer(): { offer: boolean; pending: boolean } {
  const { user } = useAuth();
  /*
   * Seeded from the last known answer, not from `undefined`.
   *
   * This used to render nothing until `/api/billing/status` came back,
   * then pop the pill in — so the whole header re-flowed a beat after
   * everything else had painted. Nothing in the chrome is allowed to
   * jump like that.
   *
   * Billing status barely ever changes, so the previous answer is a good
   * prediction of this one: a returning subscriber renders no pill from
   * the first frame, a returning free user renders it immediately, and
   * neither shifts when the fetch confirms it. Only a genuinely first-ever
   * load has nothing to go on.
   *
   * The cache is a rendering hint only — every gate that actually matters
   * is enforced server-side, so a stale value here can never unlock
   * anything.
   */
  const [status, setStatus] = useState<string | null | undefined>(() =>
    readCachedStatus(),
  );

  useEffect(() => {
    if (!user) return;
    const ctrl = new AbortController();
    void fetch("/api/billing/status", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { subscriptionStatus?: string | null } | null) => {
        if (ctrl.signal.aborted) return;
        const next = data?.subscriptionStatus ?? null;
        setStatus(next);
        writeCachedStatus(next);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setStatus(null);
      });
    return () => ctrl.abort();
  }, [user]);

  if (!user) return { offer: false, pending: false };
  if (status === undefined) return { offer: false, pending: true };
  return { offer: !isActiveSubscription(status), pending: false };
}

/**
 * The offer itself, with no trigger of its own.
 *
 * Controlled so it can be opened from a dropdown row as easily as from a
 * button: a Radix menu item cannot host a dialog trigger, it can only ask
 * for one to open.
 */
export function UpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [checkingOut, setCheckingOut] = useState(false);

  async function startCheckout() {
    setCheckingOut(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(plainError(data.error, "Couldn't open billing right now."));
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Couldn't reach billing right now.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <span
            className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary"
            aria-hidden
          >
            <Sparkles className="size-5" />
          </span>
          <DialogTitle className="mt-1">Upside Lab Pro</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Upgrading to Pro gets you nothing new (literally, not a single
            feature), but it does come with the smell of fresh coffee in the
            morning, flipping to the cool side of the pillow, and a small army
            of imaginary puppies. On a serious note, it&apos;s twelve euros a
            month to directly support Upside making this. Pretty solid deal.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-start">
          <Button
            type="button"
            onClick={() => void startCheckout()}
            disabled={checkingOut}
            className="w-full sm:w-auto"
          >
            {checkingOut ? "One sec…" : "Continue to checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Header-level "Upgrade" entry point, for the desktop bar.
 *
 * The Account page has always had the real Billing card, but that only
 * reaches someone who already went looking for it. This is the same offer
 * surfaced where every signed-in page can see it, without turning into a
 * nagging banner: a small pill, hidden entirely for anyone already
 * subscribed.
 *
 * There is no phone shape of this any more. It used to have an icon-only
 * variant that sat in `MobileTopBar`, which is how that row ended up with
 * four 44px glyphs and no room left for the portfolio name. Upgrade is a
 * monthly-at-most decision, so on the phone it is a row in the overflow
 * menu instead — see `MobileTopBar`.
 */
export function UpgradeNudge() {
  const { offer, pending } = useUpgradeOffer();
  const [open, setOpen] = useState(false);

  // First-ever load: hold the space rather than collapsing it, so the
  // header lands in its final geometry on the first paint either way.
  if (pending) {
    return (
      <span
        aria-hidden
        className="pointer-events-none invisible h-7 w-[6.5rem] shrink-0"
      />
    );
  }

  if (!offer) return null;

  return (
    <>
      {/* Ghost like every other secondary control in the bar, with the
       * accent carried by the icon and label rather than a filled tinted
       * box. It is a nudge, not the header's main action. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5 text-primary hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-3.5" aria-hidden />
        Upgrade
      </Button>
      <UpgradeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
