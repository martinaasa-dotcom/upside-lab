"use client";

import { dockFoldsSheets } from "@/lib/dock-cells";
import { useCircleHref } from "@/lib/use-circle-href";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/format";
import { stashOpenTab } from "@/lib/active-sheet";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import type { Portfolio } from "@/lib/types";
import {
  Activity,
  Calculator,
  Check,
  ChevronDown,
  FlaskConical,
  LayoutDashboard,
  Plus,
  Wallet,
} from "lucide-react";
import { People } from "@/components/People";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const MODES = [
  {
    id: OVERVIEW_TAB_ID,
    href: "/?tab=overview",
    tab: "overview",
    label: "Home",
    title: "Today's briefing and your portfolios",
    Icon: LayoutDashboard,
  },
  {
    id: PULSE_TAB_ID,
    href: "/?tab=pulse",
    tab: "pulse",
    label: "Pulse",
    title: "Pulse for names you hold",
    Icon: Activity,
  },
  {
    id: LAB_TAB_ID,
    href: "/?tab=lab",
    tab: "lab",
    label: "Lab",
    title: "Allocation, risk, trends, seasonality",
    Icon: FlaskConical,
  },
  {
    id: COMPOUND_TAB_ID,
    href: "/?tab=compound",
    tab: "compound",
    label: "Growth",
    title: "What your portfolio could become if you keep going",
    Icon: Calculator,
  },
] as const;

/** Book URL for a dock target. Used when the dock is showing on Circle. */
export function hrefForDockTarget(
  id: string,
  portfolios: Pick<Portfolio, "id" | "slug">[]
): string {
  const mode = MODES.find((m) => m.id === id);
  if (mode) return mode.href;
  const sheet = portfolios.find((p) => p.id === id);
  const token = sheet?.slug || id;
  return `/?tab=portfolio&portfolio=${encodeURIComponent(token)}`;
}

export function stashDockTab(id: string) {
  const mode = MODES.find((m) => m.id === id);
  if (mode) stashOpenTab(mode.tab);
}

export type SheetTone = "up" | "down" | null;

/**
 * One cell. Wide enough for the longest section label with its glyph and
 * padding (`Growth`, ~90px) plus air, so a section never truncates and a
 * long portfolio name is the only thing that can.
 *
 * The labels are the phone bar's: Home, Pulse, Lab, Growth, Circle. The
 * desktop dock used to spell out "Overview" and "Compound", which cost
 * ~30px a cell for no added meaning — the page header already names where
 * you are — and it is what pushed a four-sheet row into truncating on a
 * small laptop.
 */
const CELL_W = "7.5rem";

const CELL =
  "relative z-[1] flex h-11 w-full min-h-0 min-w-0 appearance-none items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium transition-colors";

const OFF = "text-muted-foreground hover:bg-hover hover:text-foreground";

/*
 * Where you are is said by the marker that slides behind the cells, not by
 * filling one of them with the accent. Which room you are in is the least
 * surprising fact on the screen, and a slab of mustard the width of a cell
 * was the loudest thing on the bar for the least reason. The phone bar says
 * it exactly the same way, so both docks are one design.
 */
const ON = "text-foreground";

/** The marker's travel. Overshoots slightly and settles, the way a marker does. */
const SLIDE = "cubic-bezier(0.34,1.28,0.52,1)";

/**
 * Sheets carry a dot where the sections carry a glyph, so every cell has
 * the same shape. A row of identical wallet icons would be noise; the dot
 * is the same size and says whether that sheet is up or down today.
 */
function ToneDot({ tone }: { tone: SheetTone }) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "up"
            ? "bg-gain"
            : tone === "down"
              ? "bg-loss"
              : "bg-current opacity-40"
        )}
      />
    </span>
  );
}

type Props = {
  /** Book tab that is on. Empty on Circle pages so only Circle lights up. */
  activeId?: string | null;
  /** Book dock: switch tabs in place. Off-book pages use links. */
  onSelectMode?: (id: string) => void;
  hiddenModeIds?: string[];
  guest?: boolean;
  /** Your portfolios, as cells in the same well as the sections. */
  sheets?: Portfolio[];
  /** Today's direction per portfolio id — the dot in that portfolio's cell. */
  sheetTodayTone?: Record<string, SheetTone>;
  /** Opens the New portfolio dialog. Omit to hide the add cell. */
  onAddSheet?: () => void;
  /** Right-click or long-press on a sheet cell. */
  onSheetMenu?: (x: number, y: number, id: string, name: string) => void;
  onSheetRename?: (id: string, name: string) => void;
  className?: string;
};

export function BookModeDock({
  activeId,
  onSelectMode,
  hiddenModeIds = [],
  guest = false,
  sheets = [],
  sheetTodayTone,
  onAddSheet,
  onSheetMenu,
  onSheetRename,
  className,
}: Props) {
  const modes = MODES.filter((m) => {
    if (guest && m.id === LAB_TAB_ID) return false;
    if (hiddenModeIds.includes(m.id)) return false;
    return true;
  });

  /*
   * The row measures itself rather than guessing from a breakpoint: what
   * decides whether your portfolios fit is the page column's width, and
   * that is the same number at 1024px with a wide gutter as at 900px with
   * a narrow one.
   */
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const apply = () => setRowWidth(el.clientWidth || null);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /*
   * The marker: one neutral pill behind the cells that slides to the one you
   * picked, rather than a fill appearing on one cell and disappearing from
   * another. It is measured off the live cell rather than computed from
   * CELL_W, because the add cell is a narrow track and the folded portfolio
   * picker carries a chevron the others do not.
   */
  const wellRef = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<{ left: number; width: number } | null>(null);
  const [travels, setTravels] = useState(false);

  const measure = useCallback(() => {
    const well = wellRef.current;
    if (!well) return;
    const on = well.querySelector<HTMLElement>("[data-on]");
    /*
     * Same object, same state. `setMark` with a freshly built object on
     * every measurement makes every measurement a re-render, and a layout
     * effect that measures after every render then never settles: React
     * error #185, "maximum update depth exceeded", which is exactly what
     * this did the first time it was written. Returning the previous value
     * when the numbers have not moved makes measuring idempotent, so it is
     * safe to measure as often as it takes to be right.
     */
    setMark((was) => {
      if (!was && !on) return was;
      if (!on) return null;
      const next = { left: on.offsetLeft, width: on.offsetWidth };
      return was && was.left === next.left && was.width === next.width
        ? was
        : next;
    });
  }, []);

  /*
   * No dependency list on purpose. What moves the marker here is not one
   * value but half a dozen: the active id, the viewer's tier, how many
   * portfolios you own, whether they folded into the picker, whether the
   * add cell is drawn, and how long the labels turned out to be. Listing
   * them is a list that goes stale; measuring after every render is not,
   * and the guard above makes it converge in one extra pass.
   */
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const well = wellRef.current;
    if (!well || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => measure());
    watch.observe(well);
    for (const cell of Array.from(well.children)) watch.observe(cell);
    return () => watch.disconnect();
  }, [measure]);

  /*
   * Held still until it has been placed once, or the first paint draws a
   * marker sliding in from the left edge of a bar nobody has touched.
   */
  useEffect(() => {
    if (!mark || travels) return;
    const frame = requestAnimationFrame(() => setTravels(true));
    return () => cancelAnimationFrame(frame);
  }, [mark, travels]);

  // Sections + Circle are fixed; the sheets are what can overrun the row.
  const fixedCells = modes.length + 1;
  const folded = dockFoldsSheets(
    modes.length,
    sheets.length,
    rowWidth,
    Boolean(onAddSheet)
  );
  const inlineSheets = folded ? [] : sheets;
  const showAdd = Boolean(onAddSheet) && !folded;
  const cellCount = fixedCells + inlineSheets.length + (folded ? 1 : 0);

  const activeSheet = sheets.find((p) => p.id === activeId) ?? null;
  const circleTo = useCircleHref();
  const onCircle = usePathname().startsWith("/communities");

  function goToSheet(id: string) {
    onSelectMode?.(id);
  }

  return (
    <div ref={rowRef} className="w-full">
    <div
      ref={wellRef}
      role="tablist"
      aria-label="App"
      /*
       * A floating card, not a well sunk into a bar. The dock has no band
       * behind it any more (see `PortfolioTabs`), so it has to read as a
       * pane lifted off the page: `.glass` with the sheen and the ring,
       * rather than `.glass-well`, which is the recessed treatment and
       * looks like a hole once there is nothing around it. Cells are inset
       * by `p-1` with `gap-1`, so the active pill floats inside the card
       * instead of running to its edges.
       *
       * `glass-dock` after `card-sheen glass` swaps the body and the blur
       * for the chrome fill and nothing else: same rim, same ring, same
       * lift shadow. A dock sits over the bottom corner with content
       * scrolling under it, so the card veil was letting the cool lobe
       * through at more chroma than the field beside it carries. The phone
       * bar takes the same material, so both docks are one pane. Numbers
       * in globals.css and DESIGN_TOKENS.md.
       */
      className={cn(
        "card-sheen glass glass-dock pointer-events-auto relative mx-auto grid w-fit max-w-full gap-1 rounded-full p-1 ring-1 ring-foreground/20",
        className
      )}
      style={{
        /*
         * Equal cells at a fixed width, and the well sized to however many
         * there are — so the dock grows by exactly one cell when you add a
         * portfolio and stays centred either way. Stretching the same five
         * cells across the full page column instead left each label
         * floating in the middle of a 230px chip, and turned the active
         * one into a slab of accent the width of a paragraph.
         */
        gridTemplateColumns: showAdd
          ? // The add cell sits with the sheets it makes, so its narrow
            // track goes second to last -- Circle keeps the end.
            `repeat(${cellCount - 1}, minmax(0, ${CELL_W})) 2.5rem minmax(0, ${CELL_W})`
          : `repeat(${cellCount}, minmax(0, ${CELL_W}))`,
      }}
    >
      {modes.map(({ id, href, tab, label, title, Icon }) => {
        const active = activeId === id;
        const inner = (
          <>
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                id === COMPOUND_TAB_ID && "scale-125"
              )}
              strokeWidth={2}
              aria-hidden
            />
            <span className="min-w-0 truncate">{label}</span>
          </>
        );
        const look = cn(CELL, active ? ON : OFF);
        if (onSelectMode) {
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              data-on={active ? "" : undefined}
              title={title}
              onClick={() => onSelectMode(id)}
              className={look}
            >
              {inner}
            </button>
          );
        }
        return (
          <Link
            key={id}
            href={href}
            prefetch
            data-on={active ? "" : undefined}
            title={title}
            onClick={() => stashOpenTab(tab)}
            className={look}
          >
            {inner}
          </Link>
        );
      })}

      {inlineSheets.map((sheet) => {
        const active = sheet.id === activeId;
        const tone = sheetTodayTone?.[sheet.id] ?? null;
        const inner = (
          <>
            <ToneDot tone={tone} />
            <span className="min-w-0 truncate">{sheet.name}</span>
          </>
        );
        const look = cn(CELL, active ? ON : OFF);
        const menu = onSheetMenu
          ? (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              onSheetMenu(e.clientX, e.clientY, sheet.id, sheet.name);
            }
          : undefined;
        const title = guest
          ? sheet.name
          : `${sheet.name} - right-click to rename or delete`;
        if (onSelectMode) {
          return (
            <button
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-on={active ? "" : undefined}
              title={title}
              onClick={() => goToSheet(sheet.id)}
              onContextMenu={menu}
              onDoubleClick={() => onSheetRename?.(sheet.id, sheet.name)}
              className={look}
            >
              {inner}
            </button>
          );
        }
        return (
          <Link
            key={sheet.id}
            href={hrefForDockTarget(sheet.id, sheets)}
            prefetch
            data-on={active ? "" : undefined}
            title={title}
            className={look}
          >
            {inner}
          </Link>
        );
      })}

      {folded && sheets.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Portfolios"
              data-on={activeSheet ? "" : undefined}
              title="Your portfolios"
              className={cn(CELL, activeSheet ? ON : OFF)}
            >
              <Wallet className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="min-w-0 truncate">
                {activeSheet?.name ?? "Portfolios"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            side="top"
            className="max-h-[min(24rem,60vh)] min-w-52 overflow-y-auto"
          >
            {sheets.map((sheet) => (
              <DropdownMenuItem
                key={sheet.id}
                onSelect={() => goToSheet(sheet.id)}
              >
                <ToneDot tone={sheetTodayTone?.[sheet.id] ?? null} />
                <span className="min-w-0 flex-1 truncate">{sheet.name}</span>
                {sheet.id === activeId ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
            {onAddSheet ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onAddSheet()}>
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>New portfolio</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {showAdd ? (
        <button
          type="button"
          onClick={() => onAddSheet?.()}
          aria-label="New portfolio"
          title="New portfolio"
          className={cn(CELL, OFF, "px-0")}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      <Link
        href={circleTo}
        prefetch
        title="Upside Circle"
        aria-current={onCircle ? "page" : undefined}
        data-on={onCircle ? "" : undefined}
        className={cn(CELL, onCircle ? ON : OFF)}
      >
        <People compact />
        <span className="min-w-0 truncate">Circle</span>
      </Link>

      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 left-0 h-11 rounded-full bg-foreground/10",
          mark ? "opacity-100" : "opacity-0",
          travels
            ? "transition-[transform,width,opacity] duration-300"
            : "transition-none",
          "motion-reduce:transition-none"
        )}
        style={
          mark
            ? {
                width: `${mark.width}px`,
                transform: `translateX(${mark.left}px)`,
                transitionTimingFunction: SLIDE,
              }
            : undefined
        }
      />
    </div>
    </div>
  );
}
