import { defineConfig } from "tsup";

// One self-contained file: hooks spawn it on every agent action, so startup must be instant
// and there must be nothing to resolve at runtime.
export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  bundle: true,
  noExternal: [/^@glasshouse\//, "zod"],
  clean: true,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
});
