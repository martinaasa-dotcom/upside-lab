"use client";

import { useEffect } from "react";
import { Geist } from "next/font/google";
import { reportClientError } from "@/lib/telemetry-client";

const geist = Geist({ subsets: ["latin"], display: "swap" });

// global-error replaces the root layout when the layout itself throws, so
// it can't rely on globals.css/Tailwind or the app's providers — it must
// bring its own <html>/<body> and inline styles.
export default function GlobalError({
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
      widget: "global-error",
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        className={geist.className}
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1rem",
          textAlign: "center",
          background: "#000000",
          color: "#fafafa",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1rem",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              margin: 0,
            }}
          >
            Upside Lab did not open
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              maxWidth: "22rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#a1a1a1",
            }}
          >
            Your portfolios are safe and nothing you own has changed. The app
            itself did not finish loading. Reload the page and it should come
            back.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              height: "2rem",
              borderRadius: "0.625rem",
              border: "none",
              background: "#d4bc79",
              color: "#262626",
              fontWeight: 500,
              fontSize: "0.875rem",
              padding: "0 0.625rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              height: "2rem",
              borderRadius: "0.625rem",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: "#fafafa",
              fontSize: "0.875rem",
              padding: "0 0.625rem",
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
