import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tl_model_lcu/tests/**/*.test.ts", "tl_model_lcu/tests/**/*.test.tsx"] },
});
