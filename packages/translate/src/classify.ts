import type { EventKind } from "@glasshouse/schema";

const TEST_PATTERNS = [
  /\b(vitest|jest|mocha|pytest|py\.test|cargo test|go test|rspec|phpunit|dotnet test|mvn test|gradle test)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/,
  /\bplaywright test\b/,
  /\bcypress run\b/,
];

const INSTALL_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(add|install|i)\b/,
  /\bpip3?\s+install\b/,
  /\buv\s+(add|pip install)\b/,
  /\bcargo add\b/,
  /\bgo get\b/,
  /\bgem install\b/,
  /\bcomposer require\b/,
];

const COMMIT_PATTERNS = [/\bgit\s+commit\b/];

/** Classify a shell command into the event kind the Room understands. */
export function classifyCommand(command: string): Extract<EventKind, "test_run" | "install" | "commit" | "command"> {
  const c = command.trim();
  if (COMMIT_PATTERNS.some((p) => p.test(c))) return "commit";
  if (TEST_PATTERNS.some((p) => p.test(c))) return "test_run";
  if (INSTALL_PATTERNS.some((p) => p.test(c))) return "install";
  return "command";
}
