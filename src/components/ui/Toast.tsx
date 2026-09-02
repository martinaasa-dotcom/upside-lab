"use client";

import { toast } from "sonner";

export type ToastKind = "success" | "error" | "info" | "warning";

/**
 * What a toast may carry beyond its one line.
 *
 * A toast is the wrong medium for a state that persists, and the alerts
 * effect used to announce "Borrowed money is 153% of your portfolio" as a
 * bare four-second line with no second sentence, no icon and nothing to
 * press. Anything loud enough to be worth a toast is loud enough to earn
 * the sentence under it and a way through to the card that will still be
 * there afterwards.
 */
export type ToastExtras = {
  description?: string | null;
  action?: { label: string; onClick: () => void };
};

type ToastContextValue = {
  push: (message: string, kind?: ToastKind, extras?: ToastExtras) => void;
};

function pushToast(
  message: string,
  kind: ToastKind = "info",
  extras?: ToastExtras
) {
  const options = {
    ...(extras?.description ? { description: extras.description } : {}),
    ...(extras?.action
      ? {
          action: {
            label: extras.action.label,
            onClick: extras.action.onClick,
          },
        }
      : {}),
  };
  if (kind === "success") toast.success(message, options);
  else if (kind === "error") toast.error(message, options);
  else if (kind === "warning") toast.warning(message, options);
  else toast(message, options);
}

export function useToast(): ToastContextValue {
  return { push: pushToast };
}

/** Toaster lives in Providers. This stays so existing rooms keep compiling. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return children;
}
