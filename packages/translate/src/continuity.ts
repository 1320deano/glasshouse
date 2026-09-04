/**
 * Continuity across tools: when a task ends (credits ran out, or the user simply stopped) and a
 * new task in a different tool starts soon after in the same part of the app, link them.
 * The Room then shows "Continuing: <task>" on the new tile, and the history reads as one story.
 *
 * The link is a judgement, so the reason is stored with it and shown to the user.
 */
export interface EndedTask {
  id: string;
  tool: string;
  prompt?: string;
  areaIds: readonly string[];
  endedAt: string;
  endReason?: string;
  /** Already continued by another task. */
  continuedBy?: string;
}

export interface FreshTask {
  tool: string;
  prompt?: string;
  areaIds: readonly string[];
  startedAt: string;
}

export interface ContinuationLink {
  taskId: string;
  reason: string;
  score: number;
}

export const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000;
const MIN_SCORE = 3;

const STOP_WORDS = new Set(["the", "and", "that", "this", "with", "from", "into", "then", "when", "what", "which", "please", "make", "sure", "also", "just", "have", "will", "should", "would", "could", "about", "there", "their", "your", "them", "they", "some", "more", "than", "like", "does", "done", "need", "want"]);

export function promptWords(prompt: string | undefined): Set<string> {
  const words = (prompt ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

export function promptOverlap(a: string | undefined, b: string | undefined): number {
  const wa = promptWords(a);
  const wb = promptWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

const TOOL_NAMES: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "the folder watcher" };
const toolName = (t: string) => TOOL_NAMES[t] ?? t;

/** Pick the best earlier task in another tool that this one continues, or null. */
export function findContinuation(candidates: readonly EndedTask[], fresh: FreshTask, windowMs = DEFAULT_WINDOW_MS): ContinuationLink | null {
  const start = new Date(fresh.startedAt).getTime();
  let best: ContinuationLink | null = null;
  for (const c of candidates) {
    if (c.tool === fresh.tool || c.continuedBy) continue;
    const ended = new Date(c.endedAt).getTime();
    const gap = start - ended;
    if (gap < -60_000 || gap > windowMs) continue;

    let score = 0;
    const reasons: string[] = [];
    if (c.endReason === "usage_limit") {
      score += 2;
      reasons.push(`${toolName(c.tool)} hit its usage limit`);
    }
    const sharedAreas = c.areaIds.filter((a) => fresh.areaIds.includes(a));
    if (sharedAreas.length > 0) {
      score += 2;
      reasons.push(`same part of the app as the ${toolName(c.tool)} task`);
    }
    const overlap = promptOverlap(c.prompt, fresh.prompt);
    if (overlap >= 0.3) {
      score += 2;
      reasons.push("the instructions match");
    } else if (overlap >= 0.15) {
      score += 1;
      reasons.push("the instructions are similar");
    }
    // Recency tie-break: a task that ended minutes ago beats one from hours ago.
    score += Math.max(0, 1 - gap / windowMs) * 0.5;

    if (score >= MIN_SCORE && (!best || score > best.score)) {
      best = { taskId: c.id, score, reason: reasons.map((r, i) => (i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r)).join("; ") };
    }
  }
  return best;
}
