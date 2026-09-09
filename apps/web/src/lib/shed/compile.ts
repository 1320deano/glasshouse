/**
 * From the owner's words to the files each tool reads. Pure, and run at read time, so a renamed
 * part of the app is right in every helper at once (the same rule as the Room's plain lines).
 *
 *   Claude Code  .claude/agents/<slug>.md      a sub-agent: front matter, then its instructions
 *   Codex        AGENTS.md                     a marked section of standing instructions (Codex reads
 *                                              AGENTS.md at the start of every session; it has no
 *                                              sub-agent files of its own)
 *   Cursor       .cursor/rules/<slug>.mdc      a rule that applies to the files the helper works in
 *
 * Boundaries are compiled from the area map to real path prefixes, so "must never touch Payments"
 * is the actual list of folders, not a hope.
 */
import type { AgentTool, Area } from "@glasshouse/schema";
import { codexMarkers, mergeSection, removeSection, type CompiledFile } from "@glasshouse/translate";
import type { HelperBrief, HelperCare, HelperRecord } from "../store/types";

export { mergeSection, removeSection };
export type { CompiledFile };

export const HELPER_TOOLS: Array<Exclude<AgentTool, "watcher">> = ["claude-code", "codex", "cursor"];

export const CARE_TEXT: Record<HelperCare, { label: string; owner: string; agent: string[] }> = {
  careful: {
    label: "Careful",
    owner: "Reads before it changes anything, runs the checks after every change, and stops if the same check fails twice.",
    agent: [
      "Read the code you are about to change before you change it, and say what you found.",
      "Make the smallest change that does the job. Do not tidy, rename or refactor anything the job does not need.",
      "Run the project's checks after every change and again before you say you are finished.",
      "If the same check fails twice for the same reason, stop and report it rather than trying a third way.",
    ],
  },
  balanced: {
    label: "Balanced",
    owner: "Works at a normal pace and runs the checks before it says it is finished.",
    agent: ["Understand the code around a change before you make it.", "Run the project's checks before you say you are finished.", "Keep the change to what the job needs."],
  },
  quick: {
    label: "Quick",
    owner: "Moves fast on small jobs. Still tells you plainly what it changed.",
    agent: ["Do the job directly; do not over-investigate a small change.", "Run the checks that cover what you changed before you finish."],
  },
};

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

export function areasById(areas: Area[]): Map<string, Area> {
  return new Map(areas.map((a) => [a.id, a]));
}

/** "Payments (src/payments, src/billing)" for a list of area ids. Unknown ids are dropped, never invented. */
export function describeAreas(ids: string[], areas: Area[]): Array<{ id: string; name: string; prefixes: string[] }> {
  const map = areasById(areas);
  return ids
    .map((id) => map.get(id))
    .filter((a): a is Area => Boolean(a))
    .map((a) => ({ id: a.id, name: a.name, prefixes: a.prefixes.map(norm).filter(Boolean) }));
}

function prefixLine(a: { name: string; prefixes: string[] }): string {
  return a.prefixes.length ? `${a.name} (${a.prefixes.map((p) => `\`${p}/\``).join(", ")})` : `${a.name}`;
}

/** The instructions themselves, shared by every tool. Markdown, headed, no front matter. */
export function instructions(helper: Pick<HelperRecord, "name" | "brief">, areas: Area[]): string {
  const b = helper.brief;
  const may = describeAreas(b.mayTouch, areas);
  const not = describeAreas(b.mustNotTouch, areas);
  const lines: string[] = [];
  lines.push(`# ${helper.name}`, "");
  lines.push("## Your job", "", b.job.trim(), "");

  lines.push("## Where you work", "");
  if (may.length) {
    lines.push("You work in these parts of the project:", "", ...may.map((a) => `- ${prefixLine(a)}`), "");
    lines.push("Read anything you need to. Change files only in the parts above unless the job cannot be done otherwise, and say so if it cannot.", "");
  } else lines.push("Work wherever the job takes you, except the parts below.", "");
  if (not.length) {
    lines.push("You must never change files in these parts:", "", ...not.map((a) => `- ${prefixLine(a)}`), "");
    lines.push("If the job seems to need a change there, stop, explain what you would need to change and why, and wait.", "");
  }

  if (b.stopAndAsk.length) {
    lines.push("## When to stop and ask", "", "Stop and ask the owner before you go on when any of these come up:", "", ...b.stopAndAsk.map((s) => `- ${s.trim()}`), "");
  }

  const care = CARE_TEXT[b.care];
  lines.push("## How to work", "", ...care.agent.map((s) => `- ${s}`), "");

  if (b.rules.length) {
    lines.push("## Things you already know", "", "The owner has answered these before. Do not ask again; act on them:", "", ...b.rules.map((r) => `- ${r.text.trim()}`), "");
  }

  lines.push(
    "## When you finish",
    "",
    "Say, in plain English and without file paths: what you changed, which parts of the project that was, what you deliberately did not touch, and whether the checks passed.",
    "Name the stage you reached (investigating, planning, building, testing, done). Never give a percentage.",
    "",
  );
  return lines.join("\n");
}

/** One line saying when the tool should hand work to this helper. */
export function whenToUse(helper: Pick<HelperRecord, "name" | "brief">, areas: Area[]): string {
  const may = describeAreas(helper.brief.mayTouch, areas);
  const job = helper.brief.job.trim().replace(/\s+/g, " ").replace(/\.$/, "");
  const where = may.length ? ` Works in: ${may.map((a) => a.name).join(", ")}.` : "";
  return `Use for: ${job}.${where}`.slice(0, 400);
}

export function compileHelper(helper: Pick<HelperRecord, "slug" | "name" | "brief">, areas: Area[]): CompiledFile[] {
  const body = instructions(helper, areas);
  const use = whenToUse(helper, areas);
  const out: CompiledFile[] = [];
  const tools = new Set<AgentTool>(helper.brief.tools);
  if (tools.has("claude-code")) {
    out.push({
      tool: "claude-code",
      path: `.claude/agents/${helper.slug}.md`,
      mode: "file",
      body: ["---", `name: ${helper.slug}`, `description: ${yamlString(use)}`, "---", "", body].join("\n"),
    });
  }
  if (tools.has("codex")) {
    const m = codexMarkers(helper.slug);
    out.push({
      tool: "codex",
      path: "AGENTS.md",
      mode: "section",
      marker: m,
      body: [m.start, `<!-- Grown in the Potting Shed. Edit it there; this section is rewritten by \`glasshouse helpers\`. -->`, "", body.replace(/^# /, "## Helper: "), m.end].join("\n"),
    });
  }
  if (tools.has("cursor")) {
    const may = describeAreas(helper.brief.mayTouch, areas);
    const globs = may.flatMap((a) => a.prefixes.map((p) => (p.includes(".") && !p.endsWith("/") && !/\/$/.test(p) && /\.[a-z0-9]+$/i.test(p) ? p : `${p}/**`)));
    out.push({
      tool: "cursor",
      path: `.cursor/rules/${helper.slug}.mdc`,
      mode: "file",
      body: ["---", `description: ${yamlString(use)}`, `globs: ${globs.length ? JSON.stringify(globs) : "[]"}`, `alwaysApply: ${globs.length ? "false" : "true"}`, "---", "", body].join("\n"),
    });
  }
  return out;
}

function yamlString(s: string): string {
  return JSON.stringify(s.replace(/\s+/g, " ").trim());
}

/** A brief the owner has said nothing in yet. */
export function emptyBrief(tools: HelperBrief["tools"] = ["claude-code", "codex", "cursor"]): HelperBrief {
  return { job: "", mayTouch: [], mustNotTouch: [], stopAndAsk: [], care: "balanced", rules: [], tools };
}
