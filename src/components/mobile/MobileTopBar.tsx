"use client";

import { useAuth } from "@/components/AuthProvider";
import { useFeedback } from "@/components/FeedbackHost";
import { HeaderBrand } from "@/components/HeaderBrand";
import { UpgradeNudge } from "@/components/billing/UpgradeNudge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import Link from "next/link";
import { Bell, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  /** Kept so older call sites still compile. The lockup always shows. */
  brand?: boolean;
  avatar?: { url?: string | null; initial?: string };
  alertCount?: number;
  onAlerts?: () => void;
  alertsHref?: string;
  /** Page actions, left of Feedback. Same slot as AppHeader children. */
  end?: ReactNode;
  /** Status row, same as desktop. Stays stuck with the bar. */
  children?: ReactNode;
  className?: string;
};

function FeedbackIconButton() {
  const { user } = useAuth();
  const { openManual } = useFeedback();
  if (!user) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={openManual}
      aria-label="Feedback"
      className="touch-target"
    >
      <MessageSquare />
    </Button>
  );
}

function hasVisibleTitle(title: ReactNode) {
  if (title == null || title === false) return false;
  if (typeof title === "string") return title.trim().length > 0;
  return true;
}

export function MobileTopBar({
  title,
  avatar,
  alertCount = 0,
  onAlerts,
  alertsHref = "/?tab=alerts",
  end,
  children,
  className,
}: Props) {
  const bell = (
    <span className="relative">
      <Bell />
      {alertCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </span>
  );

  return (
    <header
      className={cn(
        // A row, not a pane. No fill, no blur, no sticky of its own: this
        // renders inside `AppHeader`'s `.chrome-pane`, which carries the
        // glass for the whole band. It used to be a sibling above that
        // pane with its own identical `bg-background/35 backdrop-blur-2xl`,
        // and because a backdrop filter samples its own slice of what sits
        // behind it, the two landed at different tones with a seam on the
        // line between them — the phone's copy of the bug the desktop
        // chrome fixed by merging its rows. Give this a background or a
        // blur again and the seam comes straight back.
        //
        // No `border-b` either: the chrome carries exactly one edge, at
        // the bottom of the pane, which the market strip draws.
        "md:hidden",
        className
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <HeaderBrand alwaysType />
          {hasVisibleTitle(title) ? (
            <>
              <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
              {typeof title === "string" ? (
                /*
                 * The size class goes on the span, not the `<h1>` — this is
                 * chrome that happens to be a heading, and the two jobs are
                 * cleaner apart: the `<h1>` carries the landmark, the span
                 * carries the look.
                 *
                 * It is also where the heading cascade bug surfaced. While
                 * the element rules were un-layered they beat every utility,
                 * so `text-sm font-medium` here lost to 1.5rem/600 and a
                 * community's name arrived at the size of a page title.
                 */
                <h1 className="min-w-0">
                  <span className="block truncate text-sm font-medium leading-none text-muted-foreground">
                    {title}
                  </span>
                </h1>
              ) : (
                <div className="min-w-0">{title}</div>
              )}
            </>
          ) : (
            <h1 className="sr-only">Upside Lab</h1>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {end}
          <UpgradeNudge variant="icon" />
          <FeedbackIconButton />
          {onAlerts ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onAlerts}
              aria-label={
                alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
              }
              className="touch-target"
            >
              {bell}
            </Button>
          ) : alertsHref && !avatar ? (
            <Button asChild variant="ghost" size="icon-sm" className="touch-target">
              <Link
                href={alertsHref}
                aria-label={
                  alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
                }
              >
                {bell}
              </Link>
            </Button>
          ) : null}
          {avatar ? (
            /*
              * The hit area grows, the box does not. `.touch-target` sets a
              * 44px minimum, and this is the one piece of header chrome that
              * paints a visible border, so the finger target was being drawn
              * — a 44px outlined square beside 28px borderless glyphs. An
              * absolute inset gives the finger the same reach without moving
              * the pixel the eye sees.
              */
            <Link
              href="/account"
              aria-label="Account"
              title="Account"
              className="relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card after:absolute after:-inset-1.5 after:content-['']"
            >
              {avatar.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar.url}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">
                  {avatar.initial ?? "?"}
                </span>
              )}
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </header>
  );
}
