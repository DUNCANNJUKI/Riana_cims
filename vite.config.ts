import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

import { VitePWA } from "vite-plugin-pwa";

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
  server: {
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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Riana_logo.png', 'Riana_mark_transparent.png', 'marezi-letterhead.png', 'pwa-icon.svg', 'pwa-maskable.svg', 'letterhead.jpg', 'letterhead-full.jpg', 'letterhead-new.jpg'],
      manifest: {
        id: '/',
        name: 'RIANA CIMS - Client Installation Management System',
        short_name: 'RIANA CIMS',
        description: 'A comprehensive system for managing client installations, equipment tracking, and technician assignments',
        theme_color: '#086f76',
        background_color: '#086f76',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        lang: 'en',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: '/pwa-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ],
        categories: ['business', 'productivity'],
        shortcuts: [
          { name: 'Dashboard', short_name: 'Dashboard', url: '/', icons: [{ src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml' }] },
          { name: 'Install App', short_name: 'Install', url: '/install', icons: [{ src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml' }] },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB limit
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/developers\//, /^\/uploads\//],
        runtimeCaching: [
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
      "@": path.resolve(__dirname, "./src"),
      "@crms": path.resolve(__dirname, "./CRMS/src"),
    },
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "next-themes"],
  },
}));
