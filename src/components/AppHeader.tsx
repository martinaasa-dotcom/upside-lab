"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/components/AuthProvider";
import { useFeedback } from "@/components/FeedbackHost";
import {
  AppStatusStrip,
  type AppStatusProps,
} from "@/components/AppStatusStrip";
import { HeaderBrand } from "@/components/HeaderBrand";
import type { HeaderMenuItem } from "@/components/HeaderOverflowMenu";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { cn } from "@/lib/format";
import { PAGE_CHROME_SPACER_CLASS, PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  /** Where you currently are: a sheet name, or the page name. */
  title?: ReactNode;
  /** Page-specific controls. Sit left of the workspace nav on the right. */
  children?: ReactNode;
  /** Always last on the right: account avatar, never a workspace room. */
  end?: ReactNode;
  /** Hidden while a page has no workspace context to switch within. */
  showWorkspaceNav?: boolean;
  className?: string;
  status?: AppStatusProps;
  /**
   * The phone's own title, when it differs from the desktop one. The
   * Dashboard hands over a sheet picker here and a plain string above;
   * Fund reads "Upside Fund" wide and "Fund" narrow. Defaults to `title`,
   * which is what most pages want.
   */
  mobileTitle?: ReactNode;
  /**
   * Page actions for the phone row, as real buttons. Room for about one:
   * every icon button is 44px under `(pointer: coarse)` and the title is
   * what pays for each of them. Everything else goes in `mobileMenuItems`.
   */
  mobileEnd?: ReactNode;
  /**
   * The page's rows in the phone's one overflow menu. `MobileTopBar`
   * appends Feedback below a rule. Upgrade lives on Account, not here.
   */
  mobileMenuItems?: HeaderMenuItem[];
  alertCount?: number;
  onAlerts?: () => void;
};

function FeedbackHeaderButton() {
  const { user } = useAuth();
  const { openManual } = useFeedback();
  if (!user) return null;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={openManual}>
      Feedback
    </Button>
  );
}

function DefaultAccountEnd() {
  const { user, profile } = useAuth();
  if (!user) return null;
  const initial = (profile?.display_name || user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  const url = profile?.avatar_url;
  return (
    <Link href="/account" title="Account" aria-label="Account">
      <Avatar className="size-8 rounded-md">
        {url ? <AvatarImage src={url} alt="" /> : null}
        <AvatarFallback className="rounded-md text-xs font-medium">
          {initial}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

/**
 * The phone's row of the chrome, avatar and all.
 *
 * A child rather than inline in `AppHeader` so the auth subscription that
 * resolves the avatar re-renders this row alone, and so the desktop row
 * above it stays free of hooks it has no use for.
 */
function MobileBarRow({
  title,
  end,
  menuItems,
  alertCount,
  onAlerts,
}: {
  title: ReactNode;
  end?: ReactNode;
  menuItems?: HeaderMenuItem[];
  alertCount?: number;
  onAlerts?: () => void;
}) {
  const { profile, user } = useAuth();
  const initial = (profile?.display_name || user?.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  return (
    <MobileTopBar
      title={title}
      avatar={{ url: profile?.avatar_url, initial }}
      alertCount={alertCount}
      onAlerts={onAlerts}
      end={end}
      menuItems={menuItems}
    />
  );
}

/**
 * The one header every signed-in page uses.
 *
 * Fixed on desktop so Book → Fund → Communities does not move the bar.
 * Header row is 3rem, status row 2.25rem, plus the strip's own hairline:
 * 85px, which is what `PAGE_CHROME_SPACER_CLASS` reserves.
 * Tightened from 3.5/2.5: at those heights the markets bar sat a clear
 * step below the header row rather than reading as its second line.
 */
export function AppHeader({
  title,
  children,
  end,
  showWorkspaceNav = true,
  className,
  status,
  mobileTitle,
  mobileEnd,
  mobileMenuItems,
  alertCount,
  onAlerts,
}: Props) {
  return (
    <>
      {/*
       * One pane, not two: one fill, one blur, every row inside it.
       *
       * A `backdrop-filter` opens its own sampling root, so two stacked
       * elements each blurring 40px of what sits behind them average
       * different slices and land at different tones — with a seam on the
       * line where they meet. The desktop header row and the market strip
       * were merged in here for that reason; the phone's top bar was still
       * a sibling above this pane, with its own identical fill and blur,
       * and had exactly the same seam. It renders inside now
       * (`MobileBarRow`), so the phone chrome is one sheet of glass from
       * the safe-area inset down to its bottom hairline. If another row
       * ever joins the chrome, put it in here rather than beside it.
       *
       * One `<AppStatusStrip>` instance, deliberately — it holds a
       * one-second interval and polls quotes, so rendering it per
       * breakpoint would run two of each. The pane changes behaviour at
       * `md` instead: each row hides itself at the breakpoint it does not
       * belong to.
       *
       * Do not put a breakpoint class on this wrapper. Every call site used
       * to pass `hidden md:block`, which hid the strip along with the
       * header row — the market numbers were absent from every phone screen
       * while still mounted and polling. Hide a row, never the pane.
       */}
      <div
        className={cn(
          "chrome-pane sticky top-0 z-40 pt-[env(safe-area-inset-top)]",
          "md:fixed md:inset-x-0 md:top-0 md:pt-0",
          className,
        )}
      >
        <MobileBarRow
          title={mobileTitle ?? title}
          end={mobileEnd}
          menuItems={mobileMenuItems}
          alertCount={alertCount}
          onAlerts={onAlerts}
        />
        {/*
         * No `border-b` here. This wrapper is one sheet of glass, and a
         * rule between the two rows inside it is exactly what made the
         * chrome read as two stacked panes -- which was the original
         * complaint, and merging the fills alone did not settle it because
         * the line survived the merge. The only edge the chrome carries is
         * the one at its bottom, where it meets the page; the strip below
         * draws that.
         */}
        <header className="hidden md:block">
          <div
            className={cn(
              PAGE_COLUMN_CLASS,
              "flex h-12 items-center justify-between gap-2 sm:gap-3",
            )}
          >
            <div className="flex min-w-0 items-center gap-2 text-sm leading-none sm:gap-3">
              <HeaderBrand />
              {title != null && (
                <>
                  <span
                    className="hidden h-3.5 w-px shrink-0 bg-border sm:block"
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "min-w-0 truncate font-medium leading-none",
                      "text-muted-foreground",
                    )}
                  >
                    {title}
                  </span>
                </>
              )}
            </div>
            <div className="flex min-w-0 shrink items-center justify-end gap-2">
              {children}
              <FeedbackHeaderButton />
              {showWorkspaceNav && (
                <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
              )}
              {showWorkspaceNav && <WorkspaceSwitcher />}
              <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
              {end ?? <DefaultAccountEnd />}
            </div>
          </div>
        </header>
        <AppStatusStrip {...status} />
      </div>
      <div className={PAGE_CHROME_SPACER_CLASS} aria-hidden />
    </>
  );
}
