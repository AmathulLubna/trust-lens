import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ["tests/ui/index.html"] },
  define: {
    "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify("/__local-fixture"),
  },
  resolve: {
    alias: {
      "@": path.resolve("src"),
      "convex/react": path.resolve("tests/ui/mock-convex.ts"),
      "@convex-dev/auth/react": path.resolve("tests/ui/mock-auth.ts"),
    },
  },
  server: { host: "127.0.0.1", port: 5174, strictPort: false },
});
