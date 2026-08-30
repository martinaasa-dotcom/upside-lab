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
import { sheetMatchesActive } from "@/lib/active-sheet";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import {
  GROWTH_PATH,
  LAB_PATH,
  PULSE_PATH,
  hrefForTabId,
} from "@/lib/book-routes";
import type { Portfolio } from "@/lib/types";
import { CircleNavIcon } from "@/components/CircleIcons";
import {
  Activity,
  Check,
  ChevronDown,
  FlaskConical,
  House,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useDockMarker } from "@/lib/use-dock-marker";
import { DockMarker } from "@/components/DockMarker";

/*
 * No `title` on these any more, and none anywhere else on this bar that
 * only restated what the cell already says.
 *
 * A `title` draws the browser's own tooltip: unstyled OS chrome, about a
 * second after the pointer settles, over the most carefully made surface
 * in the app. It was tolerable while hovering had no answer of its own.
 * It is not now: the pointer already drags a pane with it the instant it
 * arrives, so a grey box appearing a second later is a second answer to
 * one gesture, and the slower and uglier of the two.
 *
 * Nothing accessible was lost. Every cell here carries a visible label or
 * an `aria-label`, so each one still has a name; what the titles added was
 * a longer description of a room whose name was already on the cell.
 *
 * The one that stays is on the portfolio cells, and the line is worth
 * remembering: A TITLE THAT RESTATES THE LABEL GOES, A TITLE THAT TEACHES
 * AN INTERACTION STAYS UNTIL IT HAS A BETTER HOME. "Right-click to rename
 * or delete" is the only hint that menu exists.
 */
const MODES = [
  {
    id: OVERVIEW_TAB_ID,
    href: "/",
    label: "Home",
    Icon: House,
  },
  {
    id: PULSE_TAB_ID,
    href: PULSE_PATH,
    label: "Pulse",
    Icon: Activity,
  },
  {
    id: LAB_TAB_ID,
    href: LAB_PATH,
    label: "Lab",
    Icon: FlaskConical,
  },
  {
    id: COMPOUND_TAB_ID,
    href: GROWTH_PATH,
    label: "Growth",
    Icon: TrendingUp,
  },
] as const;

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
  "dock-cell relative z-[1] flex h-11 w-full min-h-0 min-w-0 appearance-none items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium";

/*
 * No `hover:bg-hover` any more. A cell lighting up on its own is a
 * different object from the marker that says where you are, and two
 * different objects doing the same job on one bar is what made hovering
 * along it read as a row of things blinking. The pointer now drags one
 * fainter pane with it, on the marker's own physics, so reaching and
 * arriving are the same object at two weights. See `DockMarker`.
 */
const OFF = "text-muted-foreground hover:text-foreground";

/*
 * Where you are is said by the marker that slides behind the cells, not by
 * filling one of them with the accent. Which room you are in is the least
 * surprising fact on the screen, and a slab of mustard the width of a cell
 * was the loudest thing on the bar for the least reason. The phone bar says
 * it exactly the same way, so both docks are one design.
 */
const ON = "text-foreground";

/**
 * Sheets carry a dot where the sections carry a glyph, so every cell has
 * the same shape. A row of identical wallet icons would be noise; the dot
 * is the same size and says whether that sheet is up or down today.
 */
function ToneDot({ tone }: { tone: SheetTone }) {
  return (
    <span
      className="dock-glyph flex h-4 w-4 shrink-0 items-center justify-center"
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
  hiddenModeIds?: string[];
  guest?: boolean;
  /** Your portfolios, as cells in the same well as the sections. */
  sheets?: Portfolio[];
  /** Today's direction per portfolio id — the dot in that portfolio's cell. */
  sheetTodayTone?: Record<string, SheetTone>;
  /**
   * Alerts waiting on Home, as the one saturated pixel on this bar.
   *
   * The phone has drawn this dot since the dock was built and the laptop
   * drew nothing, which was an accident rather than a decision: the two
   * docks are one design, and the rule that survives every other pass here
   * is that the accent is spent on news and nothing else. A reader on a
   * laptop had no way to know something was waiting.
   */
  alertCount?: number;
  /** Opens the New portfolio dialog. Omit to hide the add cell. */
  onAddSheet?: () => void;
  /** Right-click or long-press on a sheet cell. */
  onSheetMenu?: (x: number, y: number, id: string, name: string) => void;
  onSheetRename?: (id: string, name: string) => void;
  className?: string;
};

export function BookModeDock({
  activeId,
  hiddenModeIds = [],
  guest = false,
  sheets = [],
  sheetTodayTone,
  alertCount = 0,
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

  const marker = useDockMarker();
  const wellRef = marker.ref;

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

  const activeSheet = sheets.find((p) => sheetMatchesActive(p, activeId)) ?? null;
  const circleTo = useCircleHref();
  const onCircle = usePathname().startsWith("/communities");

  return (
    <div ref={rowRef} className="w-full">
    <div
      ref={wellRef}
      /*
       * Not a tablist, though it was one until axe said otherwise.
       *
       * `role="tablist"` promises children that are all `role="tab"`, and
       * this bar holds a dropdown trigger, a "New portfolio" button that
       * opens a dialog, and a Circle link. Three of its children were never
       * tabs, which is a critical `aria-required-children` violation and,
       * worse than the rule, a lie about what the thing is: a tablist
       * switches panels inside one view, and these go to destinations. A
       * screen reader given a tablist full of links may expose none of
       * them.
       *
       * So it is what it always was, navigation, and it already sits inside
       * the `<nav aria-label="Portfolio">` in `PortfolioTabs`, which is
       * where the landmark belongs. The current destination is
       * `aria-current="page"`, which is what the Circle link already used
       * and what `MobileTabBar` uses, so the two docks now agree.
       *
       * Every cell that can be the current one says so, buttons and links
       * alike. The link forms are what an off-book page draws, so leaving
       * them out would have meant the bar announcing where you are on the
       * book and going quiet everywhere else, which is the half of the
       * problem a screen reader would actually notice.
       */
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
      {modes.map(({ id, href, label, Icon }) => {
        const active = activeId === id;
        const inner = (
          <>
            <span className="dock-glyph relative flex shrink-0">
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              {/*
                The one saturated pixel left on the bar, and the phone draws
                it in the same place for the same reason: the accent is not
                spent on which room you are in, which is the least
                surprising fact on the screen. It is spent on news.
              */}
              {id === OVERVIEW_TAB_ID && alertCount > 0 && !active ? (
                <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
            </span>
            <span className="min-w-0 truncate">{label}</span>
          </>
        );
        const look = cn(CELL, active ? ON : OFF);
        return (
          <Link
            key={id}
            href={href}
            prefetch
            data-dock-cell
            data-dock-goes
            aria-current={active ? "page" : undefined}
            data-on={active ? "" : undefined}
            className={look}
          >
            {inner}
          </Link>
        );
      })}

      {inlineSheets.map((sheet) => {
        const active = sheetMatchesActive(sheet, activeId);
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
        return (
          <Link
            key={sheet.id}
            href={hrefForTabId(sheet.id, sheets)}
            prefetch
            data-dock-cell
            data-dock-goes
            aria-current={active ? "page" : undefined}
            data-on={active ? "" : undefined}
            title={title}
            onContextMenu={menu}
            onDoubleClick={() => onSheetRename?.(sheet.id, sheet.name)}
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
              data-dock-cell
              data-on={activeSheet ? "" : undefined}
              className={cn(CELL, activeSheet ? ON : OFF)}
            >
              <Wallet
                className="dock-glyph h-4 w-4 shrink-0"
                strokeWidth={2}
                aria-hidden
              />
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
              <DropdownMenuItem key={sheet.id} asChild>
                <Link href={hrefForTabId(sheet.id, sheets)} prefetch>
                  <ToneDot tone={sheetTodayTone?.[sheet.id] ?? null} />
                  <span className="min-w-0 flex-1 truncate">{sheet.name}</span>
                  {sheetMatchesActive(sheet, activeId) ? (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                  ) : null}
                </Link>
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
          data-dock-cell
          aria-label="New portfolio"
          className={cn(CELL, OFF, "px-0")}
        >
          <Plus
            className="dock-glyph h-4 w-4 shrink-0"
            strokeWidth={2}
            aria-hidden
          />
        </button>
      ) : null}

      <Link
        href={circleTo}
        prefetch
        data-dock-cell
        data-dock-goes
        aria-current={onCircle ? "page" : undefined}
        data-on={onCircle ? "" : undefined}
        className={cn(CELL, onCircle ? ON : OFF)}
      >
        <CircleNavIcon className="dock-glyph h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="min-w-0 truncate">Circle</span>
      </Link>

      <DockMarker state={marker} shape="top-1 h-11" />
    </div>
    </div>
  );
}
