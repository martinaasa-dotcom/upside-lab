"use client";

import { cn } from "@/lib/format";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SheetPickerSheet = { id: string; name: string };

type Props = {
  sheets: SheetPickerSheet[];
  /** "all" is Overview, the combined book. */
  value: "all" | string;
  onChange: (id: "all" | string) => void;
  onAdd?: () => void;
};

/**
 * Phone sheet switcher. Lives in the header title so sheets are a
 * destination, not a filter chip parked in the Overview body.
 */
export function SheetPicker({ sheets, value, onChange, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const current =
    value === "all"
      ? "All portfolios"
      : sheets.find((s) => s.id === value)?.name ?? "All portfolios";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[data-sheet-picker="${menuId}"]`)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, menuId]);

  if (sheets.length === 0) return null;

  function placeAndToggle() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const menuW = 220;
      setPos({
        top: rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - menuW - 8),
      });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative min-w-0" data-sheet-picker={menuId}>
      <h1 className="min-w-0">
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Portfolio, ${current}`}
          title="Switch portfolio"
          onClick={placeAndToggle}
          className="touch-target inline-flex max-w-full items-center gap-1 rounded-md text-sm font-medium leading-none text-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="truncate">{current}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </button>
      </h1>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-sheet-picker={menuId}
            role="menu"
            aria-label="Portfolios"
            className="fixed z-[80] max-h-[min(24rem,70vh)] min-w-[13.5rem] overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-sm"
            style={{ top: pos.top, left: pos.left }}
          >
            <PickerRow
              label="All portfolios"
              selected={value === "all"}
              onSelect={() => {
                setOpen(false);
                onChange("all");
              }}
            />
            {sheets.map((s) => (
              <PickerRow
                key={s.id}
                label={s.name}
                selected={value === s.id}
                onSelect={() => {
                  setOpen(false);
                  onChange(s.id);
                }}
              />
            ))}
            {onAdd && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onAdd();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm text-foreground hover:bg-hover sm:py-2.5"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  New sheet
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

function PickerRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm sm:py-2.5",
        selected
          ? "bg-accent text-foreground"
          : "text-foreground hover:bg-hover"
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {selected && (
        <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      )}
    </button>
  );
}
