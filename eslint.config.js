import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".local/**",
      ".venv-audio/**",
      "ml/voice_sentinel/downloads/**",
      "ml/voice_sentinel/VoiceSentinel_Model/**",
      "src/convex/_generated/**",
      "vly-toolbar-readonly.tsx",
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Fast Refresh export restrictions do not apply: vite.config.ts disables HMR.
    },
  },
);
