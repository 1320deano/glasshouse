import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Where recordings go: GLASSHOUSE_RECORD_DIR, else ./.glasshouse/recordings in the current project. */
export function recordDir(): string {
  return process.env.GLASSHOUSE_RECORD_DIR ?? join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), ".glasshouse", "recordings");
}

export async function recordHook(tool: string, hookEvent: string): Promise<void> {
  const text = await readStdin();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  const sessionId =
    (payload && typeof payload === "object" && "session_id" in payload && typeof payload.session_id === "string"
      ? payload.session_id
      : "unknown-session");
  const dir = join(recordDir(), tool);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify({ receivedAt: new Date().toISOString(), tool, hookEvent, payload });
  await appendFile(join(dir, `${sessionId}.jsonl`), line + "\n", "utf8");
}
