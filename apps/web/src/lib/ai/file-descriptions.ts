/**
 * Per-file nouns, generated lazily and cached: "src/auth/session.ts" -> "how logged-in users
 * are identified". Templates then read "Looking at how logged-in users are identified" instead
 * of "Looking at the session part of Login". One call per batch of paths, once per file, ever.
 */
import { areaForPath } from "@glasshouse/translate";
import { z } from "zod";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";
import { askForJson, looksTechnical } from "./client";

const Reply = z.object({ descriptions: z.array(z.object({ path: z.string(), description: z.string().min(2).max(90) })).max(60) });

const SYSTEM = `You describe source files for a product owner who will never open the code.
For each path, write a noun phrase of at most 10 words that completes the sentence "The agent is looking at ___".
Start with "how", "the", "what" or "where" ("how logged-in users are identified", "the page that lists past storyboards").
Use the part of the product the file belongs to, given in brackets. Never repeat the file name, never use code words.
Reply with JSON only: {"descriptions":[{"path":"...","description":"..."}]}`;

const BATCH = 30;
const inFlight = new Set<string>();
const queued = new Map<string, Set<string>>();

export async function describeFiles(projectId: string, paths: string[]): Promise<number> {
  const q = queued.get(projectId) ?? new Set<string>();
  for (const p of paths) q.add(p);
  queued.set(projectId, q);
  if (inFlight.has(projectId)) return 0;
  inFlight.add(projectId);
  let written = 0;
  try {
    const store = getStore();
    while (q.size > 0) {
      const existing = await store.getFileDescriptions(projectId);
      const batch = [...q].filter((p) => !existing[p]).slice(0, BATCH);
      for (const p of q) if (existing[p]) q.delete(p);
      if (batch.length === 0) break;
      for (const p of batch) q.delete(p);
      const map = await store.getAreaMap(projectId);
      const user = batch.map((p) => `${p} [${areaForPath(p, map?.areas ?? [])?.name ?? "unknown part"}]`).join("\n");
      const reply = await askForJson({ purpose: "file_descriptions", projectId, system: SYSTEM, user, schema: Reply, maxTokens: 2048 });
      if (!reply) break;
      const good: Record<string, string> = {};
      for (const d of reply.descriptions) {
        const desc = d.description.trim().replace(/[.]+$/, "");
        if (batch.includes(d.path) && !looksTechnical(desc)) good[d.path] = desc.charAt(0).toLowerCase() + desc.slice(1);
      }
      if (Object.keys(good).length > 0) {
        await store.saveFileDescriptions(projectId, good);
        written += Object.keys(good).length;
        publish({ projectId, at: new Date().toISOString(), inserted: 0 });
      }
    }
  } finally {
    inFlight.delete(projectId);
  }
  return written;
}
