import { privatePageMetadata } from "@/lib/site-metadata";

export const metadata = privatePageMetadata();

/**
 * `/stock/<ticker>` is a room, and `WorkspaceShell` draws it. This file
 * exists so the address resolves; every other room in the app is the same
 * two lines for the same reason.
 */
export default function StockRoute() {
  return null;
}
