import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function shortSha(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return undefined;
  }
}

// Publicado via `vercel --prod`, nao Actions: VERCEL_GIT_COMMIT_SHA so
// existe no build da Vercel. git rev-parse cobre o build local.
const APP_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? shortSha() ?? "dev";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "icon-maskable.png"],
      manifest: {
        name: "Sunbite PDV",
        short_name: "Sunbite",
        description: "Registro de vendas da Sunbite, offline.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#841412",
        theme_color: "#841412",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Tudo precacheado: depois da primeira visita o app abre sem rede.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
