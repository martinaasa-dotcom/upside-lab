"use client";

import { cn } from "@/lib/format";
import { type ReactNode } from "react";

/**
 * Label left, one control right, one row at every width. For settings,
 * menus, and list actions. A paragraph next to a search field or a row of
 * controls still wants SPLIT_ROW on PanelHeader.
 *
 * Truncate titles on the child (`truncate`), not on this column.
 */
export const SETTING_ROW =
  "flex flex-row flex-nowrap items-center justify-between gap-3";
export const SETTING_COPY = "min-w-0 flex-1";
export const SETTING_ACTIONS =
  "flex shrink-0 items-center justify-end gap-2";
/** Title row, then the sentence. Never put that sentence in the title column. */
export const SETTING_STACK = "flex flex-col gap-1.5";

/** Title | control. A `description` sits under the row, never beside the control. */
export function SettingBar({
  children,
  action,
  description,
  align = "center",
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  const bar = (
    <div
      className={cn(
        SETTING_ROW,
        align === "start" && "items-start",
        description == null && className
      )}
    >
      <div className={SETTING_COPY}>{children}</div>
      {action != null ? <div className={SETTING_ACTIONS}>{action}</div> : null}
    </div>
  );
  if (description == null) return bar;
  return (
    <div className={cn(SETTING_STACK, className)}>
      {bar}
      {typeof description === "string" ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : (
        description
      )}
    </div>
  );
}

/**
 * Panel title with one compact control pinned on the right at every width.
 * Description always sits under the row. Use PanelHeader without this when
 * the action is a search field or a toolbar (that still stacks on a phone).
 */
export function PinnedHeader({
  title,
  subtitle,
  icon,
  iconTone = "brand",
  actions,
  controlId,
  titleClassName,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  iconTone?: "brand" | "emerald" | "zinc" | "danger";
  actions?: ReactNode;
  controlId?: string;
  titleClassName?: string;
  className?: string;
}) {
  const iconTones = {
    brand: "bg-muted text-muted-foreground",
    emerald: "bg-gain/15 text-gain",
    zinc: "bg-muted text-muted-foreground",
    danger: "bg-destructive/15 text-destructive",
  } as const;

  const heading = (
    <h2
      className={cn(
        "min-w-0 truncate font-heading text-lg font-semibold tracking-[-0.028em] text-balance text-foreground",
        titleClassName
      )}
    >
      {controlId ? (
        <label htmlFor={controlId} className="block cursor-pointer truncate">
          {title}
        </label>
      ) : (
        title
      )}
    </h2>
  );

  return (
    <SettingBar action={actions} description={subtitle} className={className}>
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              iconTones[iconTone]
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        {heading}
      </div>
    </SettingBar>
  );
}
