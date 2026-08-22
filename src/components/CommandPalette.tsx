"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem as CommandRow,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
};

export function CommandPalette({ open, onClose, items }: Props) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Jump"
      description="Jump to a portfolio, ticker, or Lab tool"
    >
      <Command>
        <CommandInput placeholder="Jump to portfolio, ticker, unlock, Lab …" />
        <CommandList>
          <CommandEmpty>No matches</CommandEmpty>
          {items.map((item) => (
            <CommandRow
              key={item.id}
              value={`${item.id} ${item.group ?? ""} ${item.label} ${item.hint ?? ""}`}
              onSelect={() => {
                onClose();
                item.run();
              }}
            >
              {item.group ? (
                <span className="text-xs font-medium text-muted-foreground group-data-selected/command-item:text-foreground">
                  {item.group}
                </span>
              ) : null}
              {item.label}
              {item.hint ? <CommandShortcut>{item.hint}</CommandShortcut> : null}
            </CommandRow>
          ))}
        </CommandList>
        <p className="border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          ↑↓ navigate · Enter run · Esc close · ⌘K toggle
        </p>
      </Command>
    </CommandDialog>
  );
}
