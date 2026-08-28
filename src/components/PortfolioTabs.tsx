"use client";

import { BookModeDock } from "@/components/BookModeDock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { usePathname } from "next/navigation";
import { useDockPad } from "@/lib/use-dock-pad";
import type { Portfolio } from "@/lib/types";
import { WORKSPACE_DOCK_SLOT_ID } from "@/lib/workspace-rooms";

type Props = {
  portfolios: Portfolio[];
  activeId: string | null;
  /** Opens the New portfolio dialog — the same one the phone opens. */
  onAdd: () => void;
  onRenameRequest?: (id: string, name: string) => void;
  onDeleteRequest?: (id: string, name: string) => void;
  /** Guests: Overview + Compound only — no Lab / sheet mutations. */
  guest?: boolean;
  /** Meta-tab ids to hide, driven by the viewer's experience tier. */
  hiddenModeIds?: string[];
  /** Hide New portfolio. Paper class accounts cannot open a real book. */
  hideAdd?: boolean;
  /** Today's $ direction per portfolio id — glanceable dot per portfolio cell. */
  sheetTodayTone?: Record<string, "up" | "down" | null>;
  className?: string;
};

type OpenMenu = {
  id: string;
  name: string;
  x: number;
  y: number;
};

/**
 * The bottom dock: one row, one well, one cell per place you can go.
 *
 * It used to be two controls side by side — a fixed pill group of app
 * sections, then a heading reading "Portfolios" over a scrolling text rail of
 * portfolio tabs with an inline name field and a "New" button. Half the
 * bar was reserved for a list that is one item long for most people, and
 * the two halves shared no shape, height, or indicator. `BookModeDock`
 * now draws every destination — sections, your portfolios, Circle — as
 * the same cell in the same well, so a one-sheet book gets one extra cell
 * rather than an empty rail. This file is what is left: the fixed shell,
 * and the right-click menu for renaming and deleting a sheet.
 */
export function PortfolioTabs({
  portfolios,
  activeId,
  onAdd,
  onRenameRequest,
  onDeleteRequest,
  guest = false,
  hiddenModeIds = [],
  hideAdd = false,
  sheetTodayTone,
  className,
}: Props) {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const pathname = usePathname();

  /*
    The rename/delete menu belongs to the cell it was opened on, and the
    cells are links now: leaving the page with it open would float it over
    the room you just arrived in, still naming the portfolio you left. The
    dock used to close it in the select handler it no longer has.
  */
  useEffect(() => {
    setMenu(null);
  }, [pathname]);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  /* A callback ref, not a `useRef`: this nav moves into a portal after the
     first render, and the node it lands as is not the node a ref captured.
     See `use-dock-pad.ts`. */
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setSlot(document.getElementById(WORKSPACE_DOCK_SLOT_ID));
  }, []);
  useDockPad(dockEl);

  function openSheetMenu(x: number, y: number, id: string, name: string) {
    if (guest) return;
    const menuW = 144;
    const menuH = 88;
    setMenu({
      id,
      name,
      x: Math.min(x, window.innerWidth - menuW - 8),
      y: Math.min(y, window.innerHeight - menuH - 8),
    });
  }

  const nav = (
    <nav
      ref={setDockEl}
      className={cn(
        /*
         * No band. The dock used to be a full-width bar -- a black veil, a
         * blur, and a hairline across the top -- with the well sitting in
         * it. That bar was a horizon line drawn across the ambient field
         * for no reason: the well already carries its own glass, so the
         * band was a second sheet of it doing nothing but cutting the page
         * in two. What is left is a centring container with nothing in it,
         * and the dock floats over the page the way it does in Arena.
         *
         * `pointer-events-none` because this element still spans the full
         * width: transparent or not, it would otherwise swallow every
         * click along the bottom of the page. The dock itself turns them
         * back on.
         */
        "keyboard-chrome pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      <div className={cn(PAGE_COLUMN_CLASS, "flex justify-center")}>
        <BookModeDock
          activeId={activeId}
          hiddenModeIds={hiddenModeIds}
          guest={guest}
          sheets={portfolios}
          sheetTodayTone={sheetTodayTone}
          onAddSheet={!guest && !hideAdd ? onAdd : undefined}
          onSheetMenu={!guest ? openSheetMenu : undefined}
          onSheetRename={!guest ? onRenameRequest : undefined}
        />
      </div>

      {menu && !guest && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              className="pointer-events-none fixed size-px"
              style={{ left: menu.x, top: menu.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-36">
            <DropdownMenuItem
              onSelect={() => {
                const id = menu.id;
                const sheetName = menu.name;
                setMenu(null);
                onRenameRequest?.(id, sheetName);
              }}
            >
              Rename
            </DropdownMenuItem>
            {onDeleteRequest && portfolios.length > 1 ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  const id = menu.id;
                  const sheetName = menu.name;
                  setMenu(null);
                  onDeleteRequest(id, sheetName);
                }}
              >
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );

  return slot ? createPortal(nav, slot) : nav;
}
