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
