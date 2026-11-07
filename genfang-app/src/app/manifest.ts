import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GENFANG",
    short_name: "GENFANG",
    description: "Henvendelser, godkendelser og tilbud for håndværksvirksomheder.",
    lang: "da",
    dir: "ltr",
    start_url: "/?kilde=app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#F3F0E8",
    theme_color: "#F3F0E8",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Afventer godkendelse", short_name: "Godkend", url: "/henvendelser?filter=aabne", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tilbud", url: "/tilbud", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
