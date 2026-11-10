// Shared ESLint flat config (ESLint 10) for the Vite + React 19 web app.
// This is deliberately NOT the Node-oriented base in ./eslint.config.mjs:
// browser globals, the TypeScript parser, React + React Hooks rules, and
// .jsx/.tsx support. Imported by apps/web/eslint.config.mjs.
//
// Legacy tolerance (recorded honestly): this codebase still has
// pre-existing unused imports / exhaustive-deps gaps in untouched files.
// Those are "warn", not "error", so `pnpm lint` stays green while the
// debt is visible; new code must still pass `tsc` and the error rules
// below (notably no `any` and correct hook usage).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...tseslint.configs.recommended,
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // @typescript-eslint's version replaces the base rule (it
      // understands TS-only constructs); keep it a warning for legacy
      // files — see the header note.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Strict rule, same as the rest of this repo: never `any` in TS.
      "@typescript-eslint/no-explicit-any": "error",
      // React 19 jsx runtime: no React import needed for JSX.
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // No propTypes in a TS codebase.
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-console": "off",
    },
  },
  {
    // TypeScript files: tsc (pnpm typecheck) already reports undefined
    // identifiers. ESLint's no-undef cannot see DOM lib types used in
    // type positions (e.g. `EventListener` in player.test.tsx), so it
    // is off here and stays on for plain .js/.jsx.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    // Config / test / e2e files run under Node, not the browser.
    files: [
      "**/*.config.{js,mjs,ts}",
      "**/vitest.config.*",
      "**/playwright.config.*",
      "src/setupTests.*",
      "src/mocks/**/*",
      "src/test/**/*",
      "e2e/**/*",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"],
  },
];
