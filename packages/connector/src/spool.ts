/**
 * Disk spool between the hook and the Room.
 *
 * Each event is one small file. Every hook invocation writes its event and then tries to send
 * everything waiting. If the Room is unreachable the files stay and the next hook retries.
 * Two hooks flushing at once may send the same event twice; the server de-duplicates by id.
 */
import type { NormalisedEvent } from "@glasshouse/schema";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONNECTOR_VERSION, type LinkedProject, spoolDir } from "./config.js";

const BATCH = 200;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export async function spoolEvent(e: NormalisedEvent): Promise<void> {
  await mkdir(spoolDir(), { recursive: true });
  await writeFile(join(spoolDir(), `${Date.now()}-${e.id}.json`), JSON.stringify(e), "utf8");
}

export interface FlushDeps {
  projects: LinkedProject[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface FlushResult {
  sent: number;
  failed: number;
  dropped: number;
}

async function safeUnlink(path: string) {
  try {
    await unlink(path);
  } catch {
    /* already gone */
  }
}

export async function flushSpool(deps: FlushDeps): Promise<FlushResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 2500;
  const result: FlushResult = { sent: 0, failed: 0, dropped: 0 };
  let files: string[];
  try {
    files = (await readdir(spoolDir())).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return result;
  }
  if (files.length === 0) return result;

  const byProject = new Map<string, Array<{ path: string; event: NormalisedEvent }>>();
  for (const f of files) {
    const path = join(spoolDir(), f);
    try {
      const event = JSON.parse(await readFile(path, "utf8")) as NormalisedEvent;
      const list = byProject.get(event.projectId) ?? [];
      list.push({ path, event });
      byProject.set(event.projectId, list);
    } catch {
      await safeUnlink(path);
      result.dropped++;
    }
  }

  for (const [projectId, items] of byProject) {
    const project = deps.projects.find((p) => p.projectId === projectId);
    if (!project) {
      for (const it of items) await safeUnlink(it.path);
      result.dropped += items.length;
      continue;
    }
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const ok = await post(fetchImpl, project, chunk.map((c) => c.event), timeoutMs);
      if (ok) {
        for (const c of chunk) await safeUnlink(c.path);
        result.sent += chunk.length;
      } else {
        for (const c of chunk) {
          const age = Date.now() - (await stat(c.path).then((s) => s.mtimeMs).catch(() => Date.now()));
          if (age > MAX_AGE_MS) {
            await safeUnlink(c.path);
            result.dropped++;
          } else {
            result.failed++;
          }
        }
        break; // the server is down; stop hammering it
      }
    }
  }
  return result;
}

async function post(fetchImpl: typeof fetch, project: LinkedProject, events: NormalisedEvent[], timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${project.server.replace(/\/+$/, "")}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${project.token}` },
      body: JSON.stringify({ connectorVersion: CONNECTOR_VERSION, events }),
      signal: ctrl.signal,
    });
    // 4xx means the batch itself is bad or the token is dead; retrying will not help.
    if (res.status >= 400 && res.status < 500) return true;
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
