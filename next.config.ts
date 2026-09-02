import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";
import { PRIVATE_NOINDEX_PATHS } from "./src/lib/seo-routes";

const ROBOTS_NOINDEX_HEADER = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow",
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["yahoo-finance2"],
  experimental: {
    // `radix-ui` is one package that re-exports every primitive as a
    // namespace, and twenty-one files here import from it. Entering that
    // barrel means entering all thirty-odd packages behind it, so a file
    // that wants the tooltip drags in the menubar and the navigation menu
    // with it. This rewrites each named import into a direct import of the
    // submodule it came from. Next optimises a list of packages by default
    // and `radix-ui` is not on it, so the one real barrel this app imports
    // from was the one nobody was optimising. `lucide-react` and `date-fns`
    // are on that default list, so naming them here would be a restatement
    // that drifts the day the default moves.
    //
    // What this buys is measured, and it is a development figure only. The
    // production output is byte for byte identical with and without it,
    // because Turbopack already tree-shakes the barrel: no chunk carries a
    // primitive the app never imports. Cold `next dev` compile of `/` is
    // where the barrel is walked in full, and there it is worth about a
    // fifth of the wait.
    //
    // `radix-ui` is the only real barrel of the four. `cmdk`, `sonner` and
    // `vaul` are single modules with no re-exports at all, so the transform
    // has nothing to rewrite in them and they are here only so the list
    // names every third-party UI package the app imports from. Adding one
    // that is not a barrel costs nothing, but it buys nothing either.
    optimizePackageImports: ["radix-ui", "cmdk", "sonner", "vaul"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: STATIC_SECURITY_HEADERS,
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      ...PRIVATE_NOINDEX_PATHS.flatMap((path) => [
        {
          source: path,
          headers: [ROBOTS_NOINDEX_HEADER],
        },
        {
          source: `${path}/:path*`,
          headers: [ROBOTS_NOINDEX_HEADER],
        },
      ]),
      {
        source: "/communities/:path+",
        headers: [ROBOTS_NOINDEX_HEADER],
      },
    ];
  },
};

export default nextConfig;
