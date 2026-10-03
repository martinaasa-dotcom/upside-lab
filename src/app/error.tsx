"use client";

import { MessageLine, MessageScreen } from "@/components/MessageScreen";
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
    <MessageScreen
      title="This screen did not load"
      actions={
        <>
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
        </>
      }
      foot={error.digest ? <>If you write in, quote this code: {error.digest}</> : null}
    >
      <MessageLine>Nothing you saved has changed. Try again, or reload the page.</MessageLine>
    </MessageScreen>
  );
}
