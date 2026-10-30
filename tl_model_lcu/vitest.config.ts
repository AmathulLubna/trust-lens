import { defineConfig, mergeConfig } from "vitest/config";
import base from "../vitest.config";

export default mergeConfig(base, defineConfig({
  test: { include: ["tl_model_lcu/tests/**/*.test.ts", "tl_model_lcu/tests/**/*.test.tsx"] },
}));
