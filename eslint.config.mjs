import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "fixtures/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Design-QA scripts are plain Node modules run by hand, not part of the app bundle.
    files: ["scripts/**/*.{mjs,ts}"],
    // Some of these functions are serialised and run inside the browser under Playwright, so both
    // the Node globals and the DOM globals are legitimate here.
    languageOptions: {
      globals: { process: "readonly", console: "readonly", fetch: "readonly", setTimeout: "readonly", clearTimeout: "readonly", document: "readonly", getComputedStyle: "readonly" },
    },
    rules: { "@typescript-eslint/no-unused-expressions": "off" },
  },
);
