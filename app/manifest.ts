import type { MetadataRoute } from "next"

// PWA manifest — makes LeadMighty HR installable to the home screen on mobile
// and desktop. Served by Next at /manifest.webmanifest and auto-linked in <head>.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lead Mighty HR",
    short_name: "LeadMighty",
    description: "Lead Mighty Human Resource Management System",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/LeadMightylogo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/LeadMightylogo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/LeadMightylogo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
