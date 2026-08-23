import type { MetadataRoute } from "next";
import { PRODUCT_BLURB, PRODUCT_NAME, PRODUCT_ORIGIN } from "@/lib/product";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: PRODUCT_ORIGIN,
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: PRODUCT_BLURB,
    start_url: "/",
    scope: "/",
    lang: "en",
    dir: "ltr",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
