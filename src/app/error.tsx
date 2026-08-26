"use client";

import { UpsideLogo } from "@/components/UpsideLogo";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/telemetry-client";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      widget: "error-boundary",
    });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <UpsideLogo variant="icon" />
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-foreground">
          Something broke on this screen
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your holdings are safe. This screen hit a snag. Try again, or
          reload if it keeps happening.
        </p>
        {error.digest && (
          <p className="text-sm text-muted-foreground">Ref: {error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => retry()}>
          <RotateCcw data-icon="inline-start" />
          Try again
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Reload page
        </Button>
      </div>
    </div>
  );
}
