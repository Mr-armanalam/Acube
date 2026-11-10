// Shared ESLint flat config (ESLint 10) for Node ESM code.
// Imported by apps/api/eslint.config.mjs. The web app (CRA) keeps its own
// react-scripts linting until the Phase 2 Vite migration.
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Existing code catches errors it only logs; do not flag those.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-console": "off",
    },
  },
];
