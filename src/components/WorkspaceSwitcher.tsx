"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { cn } from "@/lib/format";
import { BookOpen, Bot, Shield, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Rooms you leave the book for. Icons on phones, labels from md up
 * so the header doesn't overflow.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const showAdmin = isSuperadminEmail(user?.email);
  const onCommunities = pathname.startsWith("/communities");
  const onFund = pathname.startsWith("/upside-portfolio");
  const onAccount = pathname.startsWith("/account");
  const onAdmin = pathname.startsWith("/admin");
  const onBook = !onCommunities && !onFund && !onAccount && !onAdmin;

  const item = (
    active: boolean,
    href: string,
    label: string,
    title: string,
    Icon: typeof BookOpen
  ) => (
    /*
     * Room nav, not a call to action.
     *
     * The active room used to render as a filled `--primary` pill, which
     * put a second solid-yellow button in the header next to "Add
     * holding" — two things shouting "press me" when only one of them is
     * an action at all. The active room is a statement of where you are,
     * so it reads as a raised surface instead: visible at a glance, but it
     * never competes with the one real CTA in the bar. This is the one
     * "selected" in the app that does not fill; `Segmented` and the dock
     * both do, because neither sits beside a CTA.
     *
     * White type, not `--primary`. It was dim yellow on the `--selected`
     * veil, and that pairing is the mud described in `SEGMENTED_ITEM`: a
     * white veil over a near-black field lands on mid-grey, and a muted
     * warm yellow on mid-grey is barely a contrast step. Against siblings
     * that are `--muted-foreground`, a raised surface plus full-strength
     * type says "here" perfectly clearly and stays clean.
     */
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn(
        active &&
          "card-sheen bg-selected text-foreground hover:bg-selected hover:text-foreground"
      )}
    >
      <Link
        href={href}
        prefetch
        title={title}
        aria-label={label}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="h-4 w-4 md:h-3.5 md:w-3.5" />
        <span className="hidden md:inline">{label}</span>
      </Link>
    </Button>
  );

  return (
    <nav
      aria-label="Upside Lab rooms"
      className={cn("inline-flex max-w-full items-center gap-2", className)}
    >
      {item(onBook, "/", "Portfolio", "Your portfolios and daily briefing", BookOpen)}
      {item(onFund, "/upside-portfolio", "Fund", "Upside Fund, the paper portfolio Margus runs", Bot)}
      {item(onCommunities, "/communities", "Circle", "Compare portfolios with people you know", Users)}
      {showAdmin ? item(onAdmin, "/admin", "Admin", "Admin", Shield) : null}
    </nav>
  );
}
