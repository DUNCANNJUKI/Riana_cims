import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
  base: "/developers/",
  server: {
    host: "::",
    port: 5175,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8081",
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
      "@crms": path.resolve(__dirname, "./src"),
    },
  },
}));