import { describe, expect, it } from "vitest";
import { classifyCommand } from "./classify.js";

describe("classifyCommand", () => {
  it.each([
    ["pnpm test", "test_run"],
    ["npm run test -- --watch", "test_run"],
    ["pytest tests/", "test_run"],
    ["npx vitest run packages/schema", "test_run"],
    ["pnpm add zod", "install"],
    ["pip install requests", "install"],
    ["git commit -m 'fix'", "commit"],
    ["ls -la", "command"],
    ["git status", "command"],
  ])("%s -> %s", (cmd, kind) => {
    expect(classifyCommand(cmd)).toBe(kind);
  });
});
