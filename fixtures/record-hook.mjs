#!/usr/bin/env node
// Zero-dependency hook recorder used during Phase 0 to capture real agent payloads.
// Usage from a hook: node "$CLAUDE_PROJECT_DIR/fixtures/record-hook.mjs" claude-code <HookEventName>
// Appends one JSON line per hook call to fixtures/raw/<tool>/<session_id>.jsonl (next to this file).
// Always exits 0 and prints nothing, so it can never block or alter the agent.
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [tool = "claude-code", hookEvent = "unknown"] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));

try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  let payload = text;
  try { payload = JSON.parse(text); } catch { /* keep raw */ }
  const sessionId = payload && typeof payload === "object" && typeof payload.session_id === "string"
    ? payload.session_id
    : "unknown-session";
  const dir = join(here, "raw", tool);
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, `${sessionId}.jsonl`), JSON.stringify({ receivedAt: new Date().toISOString(), tool, hookEvent, payload }) + "\n");
} catch {
  /* never fail the hook */
}
process.exit(0);
