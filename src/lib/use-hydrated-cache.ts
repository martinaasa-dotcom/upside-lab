"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Read a browser-only cache (localStorage, sessionStorage) into React state
 * without tripping hydration.
 *
 * The tempting version of this is `useState(() => readCache())`. It looks like
 * it works, and on a route that never server-renders it does. But every page
 * in this app is a "use client" component, and "use client" still means
 * server-rendered-then-hydrated in the App Router. So the server renders with
 * the cache empty, the client's first render reads a full cache, the two trees
 * disagree, and React throws the server HTML away and re-renders the whole
 * subtree client-side. The visible result is the opposite of what the cache was
 * for: a flash and a slower first paint, plus a hydration error in the console.
 *
 * This reads the server-safe value on the first render, then swaps in the
 * cached value in a layout effect. Layout effects run after commit but before
 * the browser paints, so the cached value still lands in the first frame the
 * user actually sees. The instant-paint behaviour survives; the mismatch does
 * not.
 *
 * `read` must be safe to call during render on the client and is only ever
 * called there, never on the server.
 */
export function useHydratedCache<T>(
  read: () => T,
  serverValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(serverValue);

  // Intentionally not reacting to a changing `read` identity: this is a
  // one-shot hydration step, and re-running it later would stomp on state the
  // user or a fetch has since updated.
  useLayoutEffect(() => {
    const cached = read();
    if (cached !== undefined) {
      setValue((prev) => (Object.is(prev, cached) ? prev : cached));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once on mount
  }, []);

  return [value, setValue];
}
