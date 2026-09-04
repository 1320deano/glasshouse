/**
 * The digest: built from facts by `buildDigest` (zero cost), then, when configured, one AI call
 * per project per window writes a short summary on top. The summary is cached against a
 * fingerprint of the facts, so re-opening the page while nothing changed costs nothing.
 */
import { TOOL_WORDS, buildDigest, digestWindow, type Digest, type DigestWindowKind } from "@glasshouse/translate";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { digestTaskFrom } from "@/lib/store/derive";
import { aiEnabled, askForJson, looksTechnical } from "./client";

const Reply = z.object({ summary: z.string().min(3).max(700) });

const SYSTEM = `You write the two-sentence opening of a digest for a product owner who will never open the code. It says what their AI coding agents did collectively over the window, and what, if anything, needs them.
Rules: plain English, no file names, tool names as given ("Claude Code", "Codex", "Cursor"), no code words. At most 60 words. Mention a count only if it is in the facts. Never claim anything is finished, tested or safe unless the facts say so. If nothing happened, say so in one sentence.
Reply with JSON only: {"summary":"..."}`;

const WINDOW_MS: Record<DigestWindowKind, number> = { "since-checked": 0, today: 0, week: 7 * 24 * 3600 * 1000 };

/** The digest for a window, with the AI summary when configured. */
export async function digestFor(projectId: string, kind: DigestWindowKind, nowIso = new Date().toISOString()): Promise<Digest | null> {
  const store = getStore();
  const project = await store.getProject(projectId);
  if (!project) return null;
  const [lastChecked, map, cached] = await Promise.all([store.getLastChecked(projectId), store.getAreaMap(projectId), store.getDigestCache(projectId, kind)]);
  const window = digestWindow(kind, nowIso, lastChecked);
  const since = new Date(Math.min(new Date(window.start).getTime(), Date.now() - WINDOW_MS[kind]) - 60 * 60 * 1000).toISOString();
  const tasks = await store.listTasks(projectId, { since, limit: 500 });
  const previousAreaIds = cached?.body.areaIds;
  const digest = buildDigest(tasks.map((t) => digestTaskFrom(t, continuationOf(t, tasks))), map?.areas ?? [], window, { previousAreaIds, nowIso });

  if (cached && cached.fingerprint === digest.fingerprint && cached.body.summary) {
    digest.summary = cached.body.summary;
    digest.summarySource = "ai";
    return digest;
  }
  if (aiEnabled()) {
    const reply = await askForJson({ purpose: "digest", projectId, system: SYSTEM, user: digestFacts(digest), schema: Reply, maxTokens: 300 });
    if (reply && !looksTechnical(reply.summary)) {
      digest.summary = reply.summary.trim();
      digest.summarySource = "ai";
    }
  }
  await store.saveDigestCache({ projectId, kind, windowStart: window.start, windowEnd: window.end, fingerprint: digest.fingerprint, body: digest, createdAt: nowIso });
  return digest;
}

function continuationOf(t: { continuedFrom?: { taskId: string; tool: "claude-code" | "codex" | "cursor" | "watcher" } }, all: ReadonlyArray<{ id: string; tool: "claude-code" | "codex" | "cursor" | "watcher"; endReason?: string; usageLimitConfirmed?: boolean }>) {
  if (!t.continuedFrom) return undefined;
  const from = all.find((x) => x.id === t.continuedFrom!.taskId);
  return { tool: t.continuedFrom.tool, endReason: from?.endReason, usageLimitConfirmed: from?.usageLimitConfirmed };
}

export function digestFacts(d: Digest): string {
  const when = d.window.kind === "since-checked" ? "since the owner last checked" : d.window.kind === "today" ? "today" : "this week";
  return [
    `Window: ${when} (${d.window.start} to ${d.window.end}).`,
    d.done.length > 0 ? `Finished (${d.done.length}):\n${d.done.map((x) => `- [${TOOL_WORDS[x.tool]}] ${x.headline}${x.needsYou !== "nothing" ? ` (needs you: ${x.needsYou})` : ""}${x.note ? ` (${x.note})` : ""}`).join("\n")}` : "Finished: nothing.",
    d.stillGoing.length > 0 ? `Still going (${d.stillGoing.length}):\n${d.stillGoing.map((x) => `- [${TOOL_WORDS[x.tool]}] ${x.headline} (${x.stage}${x.location ? `, in ${x.location}` : ""})`).join("\n")}` : "Still going: nothing.",
    d.needsYou.length > 0 ? `Needs you (${d.needsYou.length}):\n${d.needsYou.map((x) => `- ${x.status}: ${x.headline}${x.detail ? ` — ${x.detail}` : ""}`).join("\n")}` : "Needs you: nothing.",
    d.newInApp.areas.length > 0 ? `New parts of the app: ${d.newInApp.areas.join(", ")}` : "",
    d.newInApp.dependencies.length > 0 ? `New tools added to the project: ${d.newInApp.dependencies.join(", ")}` : "",
    d.newInApp.filesCreated > 0 ? `New files: ${d.newInApp.filesCreated}${d.newInApp.areasWithNewFiles.length ? ` (in ${d.newInApp.areasWithNewFiles.join(", ")})` : ""}` : "",
    d.toolsUsed.length > 0 ? `Tools used: ${d.toolsUsed.map((t) => `${TOOL_WORDS[t.tool]}: ${t.tasks} task${t.tasks === 1 ? "" : "s"}${t.note ? ` (${t.note})` : ""}`).join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
