import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("embla-carousel")) return "carousel";
          if (id.includes("@radix-ui")) {
            const match = id.match(/@radix-ui\/([^/]+)/);
            if (match) return `radix-${match[1].replace(/^react-/, "")}`;
            return "radix";
          }
          if (id.includes("lucide-react") || id.includes("react-icons")) return "icons";
          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform") ||
            id.includes("zod") ||
            id.includes("drizzle-zod")
          )
            return "forms";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("framer-motion")) return "motion";
          if (
            id.includes("date-fns") ||
            id.includes("react-day-picker")
          )
            return "dates";
          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
