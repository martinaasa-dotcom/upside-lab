"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { sanitizeSheetName } from "@/lib/input-guard";

type Props = {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
  /** Defaults to the rename-sheet wording so existing callers are unaffected. */
  title?: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
};

/**
 * Generic "name this thing" modal — used for both renaming an existing
 * sheet and creating a new one, so the zero-sheets empty state doesn't need
 * to fall back to a native window.prompt() (which looked broken next to
 * every other themed modal in the app).
 */
export function RenameSheetModal({
  open,
  initialName,
  onClose,
  onSave,
  title = "Rename portfolio",
  label = "Name",
  placeholder,
  confirmLabel = "Save",
}: Props) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setBusy(false);
  }, [open, initialName]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = sanitizeSheetName(name);
    if (!trimmed) return;
    setBusy(true);
    onSave(trimmed);
  }

  return (
    <ViewportOverlay
      className="z-50 flex items-center justify-center p-4"
      onClose={onClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="scroll-host relative max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-popover p-6 ring-1 ring-foreground/20"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        <label className="grid gap-1 text-sm text-muted-foreground">
          {label}
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder={placeholder}
            required
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !sanitizeSheetName(name)}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </div>
      </form>
    </ViewportOverlay>
  );
}
