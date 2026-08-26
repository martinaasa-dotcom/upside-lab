"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Fragment } from "react";

export type HeaderMenuItem = {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  /**
   * Draw a rule above this row. The phone's bar folds the chrome's own
   * controls (Upgrade, Feedback) into the same menu as the page's, and
   * without a rule between them "Show forecast" and "Feedback" read as
   * one list of the same kind of thing.
   */
  separated?: boolean;
  onSelect: () => void;
};

type Props = {
  items: HeaderMenuItem[];
  label?: string;
  /** Shown next to the icon on wide screens — set "" to keep icon-only. */
  showLabel?: boolean;
  icon?: LucideIcon;
  /** Renders a round avatar (photo, else an initial) instead of `icon`. */
  avatar?: { url?: string | null; initial?: string };
};

export function HeaderOverflowMenu({
  items,
  label = "More",
  showLabel = true,
  icon: Icon = MoreHorizontal,
  avatar,
}: Props) {
  if (items.length === 0) return null;

  return (
    <div className="relative flex">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Ghost, like every other secondary control in the header. An
           * outlined box here made View read as a heavier control than
           * Feedback next to it, for no reason — they do the same kind of
           * job. */}
          <Button
            type="button"
            variant="ghost"
            size={avatar ? "icon" : "default"}
            aria-label={label}
            title={label}
            className={cn("touch-target", avatar && "size-8")}
          >
            {avatar ? (
              avatar.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar.url}
                  alt=""
                  className="h-6 w-6 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-semibold text-foreground">
                  {avatar.initial ?? "?"}
                </span>
              )
            ) : (
              <Icon data-icon="inline-start" />
            )}
            {showLabel && !avatar ? (
              <span className="hidden lg:inline">{label}</span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {avatar ? (
            <>
              <DropdownMenuLabel className="text-sm text-foreground">
                {label}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {items.map((item, i) => (
            <Fragment key={item.id}>
              {item.separated && i > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={item.disabled}
                variant={item.danger ? "destructive" : "default"}
                onSelect={() => {
                  if (item.disabled) return;
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.hint ? (
                  <DropdownMenuShortcut className="text-sm tabular-nums">
                    {item.hint}
                  </DropdownMenuShortcut>
                ) : null}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
