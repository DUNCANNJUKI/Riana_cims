import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "node:fs";
import { prepareCallBackgroundAssets } from "./scripts/call-background-assets.cjs";
import appleStartupSizes from "./scripts/pwa-startup-sizes.json" with { type: "json" };

import { VitePWA } from "vite-plugin-pwa";

const backgroundRuntime = prepareCallBackgroundAssets(import.meta.dirname);

const packageNameFromId = (id: string) => {
  const normalized = id.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return null;
  const parts = normalized.slice(index + marker.length).split("/");
  return parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
};

const manualChunks = (id: string) => {
  const packageName = packageNameFromId(id);
  if (!packageName) return undefined;

  if (["react", "react-dom", "scheduler", "react-is"].includes(packageName)) return "vendor-react";
  if (["react-router", "react-router-dom", "@remix-run/router", "@tanstack/react-query"].includes(packageName)) return "vendor-router-query";
  if (packageName.startsWith("@radix-ui/") || packageName === "@floating-ui/react-dom" || packageName === "@floating-ui/dom" || packageName === "@floating-ui/core" || packageName === "@floating-ui/utils") return "vendor-radix";
  if (["lucide-react", "class-variance-authority", "clsx", "tailwind-merge", "tailwindcss-animate", "sonner", "cmdk", "vaul"].includes(packageName)) return "vendor-ui";
  if (["recharts", "recharts-scale", "react-smooth", "react-transition-group"].includes(packageName)) return "vendor-recharts";
  if (packageName.startsWith("d3-") || packageName === "victory-vendor" || packageName === "internmap" || packageName === "decimal.js-light") return "vendor-d3";
  if (packageName === "html2canvas") return "vendor-html2canvas";
  if (["jspdf", "jspdf-autotable", "dompurify", "canvg", "rgbcolor", "svg-pathdata", "fast-png", "iobuffer", "fflate", "text-segmentation"].includes(packageName)) return "vendor-jspdf";
  if (["date-fns", "zod", "react-hook-form", "@hookform/resolvers", "libphonenumber-js"].includes(packageName)) return "vendor-forms-utils";
  if (["react-day-picker", "embla-carousel", "embla-carousel-react", "embla-carousel-reactive-utils", "input-otp", "react-resizable-panels", "next-themes"].includes(packageName)) return "vendor-interactions";

  return undefined;
};// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.CALL_BACKGROUND_ASSET_PATH': JSON.stringify(backgroundRuntime.assetPath),
  },
  server: {
    watch: { ignored: ['**/release/**', '**/CRMS/dist/**', '**/Deployment/**', '**/Deployment-packages/**', '**/server/private_uploads/**', '**/server/uploads/**'] },
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.runtime/**", "**/backups/**"],
    },
    host: "::",
    port: 8090,
    proxy: {
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'riana-startup-document',
      transformIndexHtml(html: string) {
        const css = readFileSync(new URL('./src/components/common/SiteLoader.css', import.meta.url), 'utf8');
        const mark = readFileSync(new URL('./public/pwa/startup-mark-v3.png', import.meta.url)).toString('base64');
        const splashLinks = appleStartupSizes.flatMap(([width, height, scale]) =>
          ['light', 'dark'].map(theme =>
            `<link rel="apple-touch-startup-image" href="/pwa/ios-${width}x${height}-${scale}x-${theme}-v3.png" media="(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait) and (prefers-color-scheme: ${theme})" />`
          )
        ).join('\n    ');
        return html
          .replace('<!-- riana-startup-styles -->', `<style>${css}</style>`)
          .replace('src="/pwa/startup-mark-v3.png"', `src="data:image/png;base64,${mark}"`)
          .replace('<!-- riana-apple-startup-images -->', splashLinks);
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Riana_logo.png', 'Riana_mark_transparent.png', 'Riana_mark_color_trimmed.png', 'marezi-letterhead.png', 'pwa/startup-*.png', 'pwa/startup.js', 'push-handlers.js', 'letterhead.jpg', 'letterhead-full.jpg', 'letterhead-new.jpg'],
      manifest: {
        id: '/',
        name: 'RIANA CIMS - Client Installation Management System',
        short_name: 'RIANA CIMS',
        description: 'A comprehensive system for managing client installations, equipment tracking, and technician assignments',
        theme_color: '#eff7fa',
        background_color: '#eff7fa',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        lang: 'en',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa/startup-any-192-v3.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa/startup-any-512-v3.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa/startup-maskable-512-v3.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        categories: ['business', 'productivity'],
        shortcuts: [
          { name: 'Dashboard', short_name: 'Dashboard', url: '/', icons: [{ src: '/pwa/startup-any-192-v3.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Install App', short_name: 'Install', url: '/install', icons: [{ src: '/pwa/startup-any-192-v3.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      workbox: {
        importScripts: ['push-handlers.js'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB limit
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,webmanifest}'],
        // iOS selects its native launch image; other clients only need the shared shell.
        globIgnores: ['call-backgrounds/**/*', 'pwa/ios-*.png'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/developers\//, /^\/uploads\//],
        runtimeCaching: [
          {
            // Branding is still dynamic; refresh online and retain icons for offline startup.
            urlPattern: ({ url }) => /^\/api\/public\/company-pwa-icon\/(180|192|512)\.png$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'riana-pwa-icons-v2',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'riana-images-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/mediapipe/wasm/') || url.pathname.endsWith('.tflite'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'riana-call-background-model-v1',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      }
    })
  ].filter(Boolean),
  build: {
    // The largest intentional chunk is the lazy PDF vendor bundle. Feature panes are lazy-loaded,
    // so this threshold catches regressions without warning on audited third-party library size.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@crms": path.resolve(import.meta.dirname, "./CRMS/src"),
    },
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "next-themes"],
  },
}));
