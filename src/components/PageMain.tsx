"use client";

import { AutoFold } from "@/components/AutoFold";
import { PAGE_MAIN_CLASS } from "@/lib/page-shell";
import type { ReactNode } from "react";

/**
 * Every signed-in page's `main`, and the one place the below-fold
 * deferral is applied.
 *
 * This exists so that a room written next year gets the deferral without
 * anybody reading this file: use `PageMain` and the sections past the
 * fold stop being built on the press, measured against the reader's own
 * screen. `auto-fold.ts` explains why it has to be a memory rather than
 * a measurement taken up front.
 *
 * `whole` opts a page out. There is no page using it today; it is here
 * because the failure mode of a deferral is a section that is not there,
 * and a page that needs all of itself on the first frame should be able
 * to say so without hand-editing the shell.
 */
export function PageMain({
  children,
  whole = false,
}: {
  children: ReactNode;
  /** Render every section up front, as pages did before this existed. */
  whole?: boolean;
}) {
  return (
    <main id="main" className={PAGE_MAIN_CLASS}>
      {whole ? children : <AutoFold>{children}</AutoFold>}
    </main>
  );
}
