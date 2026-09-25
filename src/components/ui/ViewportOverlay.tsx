"use client";

import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import {
  isEditableField,
  keepFocusedFieldVisible,
  useOverlayScrollLock,
} from "@/lib/use-visual-viewport";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * Wires Escape-to-close and keeps Tab from leaving the dialog. Every
   * closable modal built on this shell should pass the same handler its
   * backdrop button already uses — omit only for a dialog that must not
   * be dismissed (e.g. a forced first-run step).
   */
  onClose?: () => void;
  /** id of the heading inside `children` that names this dialog. */
  ariaLabelledBy?: string;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function scrollFocusedField(e: FocusEvent<HTMLDivElement>) {
  if (!isEditableField(e.target)) return;
  requestAnimationFrame(() => keepFocusedFieldVisible(e.target));
}

/**
 * Full-screen dimmer that tracks the visible viewport. Bottom sheets and
 * centered dialogs stay above the virtual keyboard; the app header does not
 * move with it.
 *
 * Also the shared a11y shell for every hand-rolled modal/drawer in the app
 * (these predate the shadcn Dialog primitive): Escape closes, and Tab stays
 * inside the dialog instead of leaking into the page underneath.
 */
export function ViewportOverlay({
  children,
  className,
  style,
  onClose,
  ariaLabelledBy,
}: Props) {
  useOverlayScrollLock();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const node = ref.current;
      if (!node) return;
      if (e.key === "Escape") {
        if (!onClose) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !node.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  /*
    Rendered into `document.body`, never inside the room that opened it.
    A room is its own stacking context (and a glass panel with a
    backdrop filter is a containing block for anything fixed inside it),
    so a dialog's own z-index only counted within its room: measured on a
    phone, the sample notice (z-40, outside every room) sat on top of the
    Cash dialog (z-50, inside one) and covered its field. The covered-call
    dialog had been portalled on its own for the second half of this;
    every hand-rolled dialog is now. Dialogs only ever open from a press,
    so there is no server render of an open one to disagree with.
  */
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      className={cn("viewport-overlay fixed overflow-x-hidden", className)}
      style={{
        top: "var(--vv-top, 0px)",
        left: "var(--vv-left, 0px)",
        width: "var(--vv-width, 100%)",
        height: "var(--vv-height, 100%)",
        ...style,
      }}
      onFocusCapture={scrollFocusedField}
    >
      {children}
    </div>,
    document.body
  );
}
