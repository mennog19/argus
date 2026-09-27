import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  { ignores: ["dist", "src-tauri/target", "node_modules"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // Type-aware linting, scoped to the sources tsconfig.json covers. These
  // rules need the type checker, which is why they can't live in the block
  // above: it also matches config files that sit outside the project.
  {
    files: ["{src,tests}/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The codebase deliberately fires promises it doesn't await (`void
      // save()`); these rules are what keep a *missing* `void` — an
      // unhandled rejection — from looking the same as an intentional one.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      // `no-non-null-assertion` is deliberately NOT enabled: it is in direct
      // tension with the 100% branch-coverage gate. Replacing a `!` with a
      // defensive `if (x === undefined) return` adds a branch that, by the
      // assertion's own premise, no test can reach — so the rule would trade
      // a documented assumption for an uncoverable one. The convention here
      // is a comment above each `!` saying what guarantees it instead.
    },
  },
  // An async stub with no `await` is just a fake returning a resolved
  // promise — normal in tests, not worth failing CI over.
  {
    files: ["tests/**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  eslintConfigPrettier,
];
