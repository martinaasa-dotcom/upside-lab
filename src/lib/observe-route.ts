import { isRequestAbort } from "@/lib/abort";
import { logEvent, routeMeta, SLOW_ROUTE_MS } from "@/lib/telemetry";

/**
 * Time a route handler. Logs `slow_route` when the handler takes more than
 * 1s to return a Response (streamed bodies are measured to first byte).
 */
export function observeRoute<Args extends unknown[], Result>(
  handler: (...args: Args) => Result | Promise<Result>,
  route?: string
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    const started = performance.now();
    let status: number | undefined;
    const meta = { ...routeMeta(args[0]), ...(route ? { route } : {}) };
    try {
      const result = await handler(...args);
      if (result instanceof Response) status = result.status;
      return result;
    } catch (err) {
      if (!isRequestAbort(err)) {
        logEvent(
          "route_throw",
          {
            ...meta,
            message: err instanceof Error ? err.message : String(err),
          },
          "error"
        );
      }
      throw err;
    } finally {
      const ms = Math.round(performance.now() - started);
      if (ms > SLOW_ROUTE_MS) {
        logEvent(
          "slow_route",
          { ...meta, ms, status: status ?? 0 },
          "warn"
        );
      }
    }
  };
}
