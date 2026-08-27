import { execSync } from "node:child_process";
import { resolve } from "node:path";
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
  build: {
    rollupOptions: {
      // Duas paginas, nao duas rotas (Etapa 10). O iPad carrega
      // `display.html` e baixa so o que a tela do cliente precisa; o pacote de
      // entrada do celular continua sem o client do Supabase. Se isto virar
      // uma rota de `App.tsx` um dia, essa promessa cai junto.
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        display: resolve(import.meta.dirname, "display.html"),
      },
    },
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
        // mp4 entra por causa do video do Customer Display: ele TEM que ficar
        // dentro do iPad, nunca baixando pela rede no meio da feira. Se o
        // video definitivo passar de ~40 MB, tirar `mp4` daqui e deixar o iPad
        // baixar uma vez no Wi-Fi de casa — precachear centenas de MB trava a
        // primeira abertura do app.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,mp4}"],
        navigateFallback: "index.html",
        // Sem isto o service worker responde `index.html` para /display e o
        // iPad abre o PDV. O denylist e o que faz a segunda pagina continuar
        // existindo depois de o app estar instalado.
        navigateFallbackDenylist: [/^\/display/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
