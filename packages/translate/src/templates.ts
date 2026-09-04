/**
 * Template translation: the ~10 common action kinds rendered in owner language, using the
 * area map for the nouns. Costs nothing. Every result keeps the event id so the technical
 * detail toggle can always show the real action underneath (rule 3).
 */
import type { Area, NormalisedEvent } from "@glasshouse/schema";
import { areaForPath } from "./areas.js";
import { describeFile, shortFileLabel } from "./files.js";

export interface TranslateContext {
  areas: readonly Area[];
  /** Cached noun phrases per path, e.g. "how logged-in users are identified". AI or user written. */
  fileDescriptions?: Readonly<Record<string, string>>;
}

export interface Translation {
  /** The plain-English line. */
  plain: string;
  /** Points back at the event it describes. */
  eventId: string;
  areaId?: string;
  areaName?: string;
  /** The noun used for the file, when there was one. */
  noun?: string;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : s);
const quote = (s: string) => `“${s}”`;
const firstLine = (s: string | undefined) => (s ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";

export function nounFor(path: string, ctx: TranslateContext): { noun: string; area?: Area } {
  const area = areaForPath(path, ctx.areas);
  const cached = ctx.fileDescriptions?.[path.replace(/\\/g, "/")];
  return { noun: cached ?? describeFile(path, area?.name), area };
}

/** "Login → session": the location line on the tile. */
export function locationFor(path: string | undefined, ctx: TranslateContext): string | undefined {
  if (!path) return undefined;
  const area = areaForPath(path, ctx.areas);
  const label = shortFileLabel(path);
  if (!area) return label;
  return label && label.toLowerCase() !== area.name.toLowerCase() ? `${area.name} → ${label}` : area.name;
}

const GIT_WORDS: Array<[RegExp, string]> = [
  [/\bgit\s+(push)\b/, "Sending the work up to GitHub"],
  [/\bgit\s+(pull|fetch)\b/, "Getting the latest changes from GitHub"],
  [/\bgit\s+(status|diff|log|show|blame)\b/, "Checking what has changed"],
  [/\bgit\s+(checkout|switch)\b/, "Switching to a different branch"],
  [/\bgit\s+(add|stage)\b/, "Getting changes ready to save"],
  [/\bgit\s+(stash)\b/, "Setting changes aside for a moment"],
  [/\bgit\s+(rebase|merge)\b/, "Combining branches"],
  [/\bgit\s+(reset|restore|revert)\b/, "Undoing changes"],
  [/\bgit\s+(clone|init)\b/, "Setting up a copy of the project"],
  [/\bgit\b/, "Working with the project's history"],
];

const COMMAND_WORDS: Array<[RegExp, string]> = [
  [/\b(pnpm|npm|yarn|bun)\s+(run\s+)?(build)\b|\btsc\s+-b\b|\bnext\s+build\b/, "Building the app"],
  [/\b(pnpm|npm|yarn|bun)\s+(run\s+)?(dev|start)\b|\bnext\s+(dev|start)\b|\bnodemon\b|\bflask run\b|\buvicorn\b|\brails s(erver)?\b/, "Starting the app to try it"],
  [/\b(typecheck|tsc|eslint|lint|prettier|ruff|flake8|mypy|black|pylint|clippy|gofmt|go vet)\b/, "Checking the code for mistakes"],
  [/^(ls|dir|tree|pwd|find|fd|cat|head|tail|less|more|wc|grep|rg|ag|which|where|type|file|stat)\b/, "Looking around the project"],
  [/^(mkdir|cp|mv|rm|rmdir|touch|chmod|ln|rename)\b/, "Tidying files and folders"],
  [/^(curl|wget|http|httpie)\b/, "Calling a web address"],
  [/^(echo|printf)\b/, "Printing a message"],
  [/^(cd)\b/, "Moving to another folder"],
  [/\b(docker|podman)\b/, "Working with the app's containers"],
  [/\b(supabase|prisma|drizzle|psql|mysql|sqlite3|migrate)\b/, "Working with the database"],
  [/\b(python3?|node|deno|bun|ruby|php|java|go run|cargo run)\b\s+\S/, "Running a small program"],
  [/\b(gh|glab)\b/, "Talking to GitHub"],
  [/\b(vercel|netlify|fly|railway|heroku|wrangler|aws|gcloud|az)\b/, "Talking to the hosting service"],
  [/\b(open|start|xdg-open)\b/, "Opening something"],
];

function packagesFrom(command: string): string[] {
  const m = command.match(/\b(?:add|install|i|get|require)\b\s+(.+)$/);
  if (!m) return [];
  return m[1]!
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("-") && !/^(&&|\|\||;)$/.test(t))
    .map((t) => t.replace(/@[\^~]?[\d.]+.*$/, ""))
    .slice(0, 4);
}

function describeCommand(e: NormalisedEvent): string {
  const cmd = (e.command ?? "").trim();
  const c = cmd.replace(/^(cd\s+\S+\s*&&\s*)/, "");
  for (const [re, words] of GIT_WORDS) if (re.test(c)) return words;
  for (const [re, words] of COMMAND_WORDS) if (re.test(c)) return words;
  return "Running a command";
}

function usedAgentDescription(e: NormalisedEvent): string | undefined {
  // The Claude Code normaliser puts the agent's own one-line description in `summary` when it
  // wrote one; otherwise the summary starts with "Ran:". Codex/Cursor summaries follow the same rule.
  if (!e.command) return undefined;
  if (e.summary.startsWith("Ran:") || e.summary === e.command) return undefined;
  return e.summary;
}

function testsLine(e: NormalisedEvent): string {
  if (e.tests && (e.tests.passed !== undefined || e.tests.failed !== undefined)) {
    const passed = e.tests.passed ?? 0;
    const failed = e.tests.failed ?? 0;
    if (failed > 0) return `Ran the checks: ${passed} passed, ${failed} failed`;
    return `Ran the checks: all ${passed} passed`;
  }
  if (e.success === false) return "The checks were interrupted";
  return "Ran the checks";
}

function permissionLine(e: NormalisedEvent): string {
  const tool = e.sourceTool ?? "";
  if (/^bash$/i.test(tool) || /shell|exec/i.test(tool)) return "Waiting for you to approve a command";
  if (/edit|write|patch/i.test(tool)) return "Waiting for you to approve a file change";
  if (/web/i.test(tool)) return "Waiting for you to approve a web request";
  if (e.summary && !/^Waiting for your permission/.test(e.summary)) return clip(e.summary, 120);
  return "Waiting for you to approve something";
}

function errorLine(e: NormalisedEvent, noun?: string): string {
  const raw = (e.text ?? e.summary).toLowerCase();
  let what = "Something went wrong";
  if (/not found|no such file|enoent|cannot find|does not exist/.test(raw)) what = "Could not find something it was looking for";
  else if (/exit(ed)? (with )?code [1-9]|non-zero exit|command failed/.test(raw)) what = "A command did not finish cleanly";
  else if (/timed? ?out|timeout/.test(raw)) what = "A step took too long and was cut off";
  else if (/permission denied|eacces|forbidden|unauthori[sz]ed/.test(raw)) what = "Was not allowed to do something";
  else if (/syntax|unexpected token|parse error/.test(raw)) what = "The code did not read correctly";
  else if (/failed|error/.test(raw)) what = "A step failed";
  return noun ? `${what} while working on ${noun}` : what;
}

/** Turn one normalised event into its plain-English line. Pure. */
export function translateEvent(e: NormalisedEvent, ctx: TranslateContext): Translation {
  const path = e.paths[0];
  const named = path ? nounFor(path, ctx) : undefined;
  const area = named?.area;
  const base = { eventId: e.id, areaId: area?.id, areaName: area?.name, noun: named?.noun };
  const plain = ((): string => {
    switch (e.kind) {
      case "session_start":
        return "Started up";
      case "session_end":
        return "Closed the session";
      case "prompt":
        return e.prompt ?? e.text ? `You asked: ${quote(clip((e.prompt ?? e.text)!.replace(/\s+/g, " ").trim(), 140))}` : "You gave a new instruction";
      case "read":
        return named ? `Looking at ${named.noun}` : "Looking at a file";
      case "search": {
        // A bare folder name ("src") is not a top-level file, so it must not land in the root area.
        const scopeArea = path && (path.includes("/") || /\.[a-z0-9]+$/i.test(path)) ? area : undefined;
        const scope = scopeArea ? scopeArea.name : "the project";
        return e.text ? `Searching ${scope} for ${quote(clip(e.text, 60))}` : `Searching ${scope}`;
      }
      case "edit": {
        if (!named) return "Changing a file";
        if (/^(Created|Added)\b/.test(e.summary)) return `Adding ${named.noun}`;
        if (/^(Deleted|Removed)\b/.test(e.summary)) return `Removing ${named.noun}`;
        return `Changing ${named.noun}`;
      }
      case "command":
        return usedAgentDescription(e) ?? describeCommand(e);
      case "test_run":
        return testsLine(e);
      case "install": {
        const pkgs = packagesFrom(e.command ?? "");
        return pkgs.length > 0 ? `Adding ${pkgs.join(", ")} to the project's tools` : "Installing the project's tools";
      }
      case "commit": {
        const msg = firstLine(e.text);
        return msg ? `Saved a checkpoint: ${quote(clip(msg, 100))}` : "Saved a checkpoint of the work";
      }
      case "web": {
        if (/^Searched the web/.test(e.summary)) return clip(e.summary, 120);
        const url = e.summary.replace(/^Looked at\s+/, "");
        const host = url.match(/^https?:\/\/([^/\s]+)/)?.[1];
        return host ? `Read a web page on ${host}` : "Read a web page";
      }
      case "plan": {
        const line = firstLine(e.text);
        return line ? `Wrote down the plan: ${quote(clip(line, 80))}` : "Wrote down the plan";
      }
      case "reasoning": {
        const line = firstLine(e.text);
        return line ? `Thinking: ${quote(clip(line, 100))}` : "Thinking it through";
      }
      case "subagent_start": {
        const desc = e.summary.replace(/^Started a helper:?\s*/, "").replace(/^\((.*)\)$/, "$1");
        return desc && desc !== "unnamed" && desc !== e.summary ? `Sent a helper off to ${desc.charAt(0).toLowerCase() + desc.slice(1)}` : "Sent a helper off to work on part of this";
      }
      case "subagent_stop":
        return "A helper finished its part";
      case "permission_wait":
        return permissionLine(e);
      case "permission_denied":
        return "You said no. It is trying another way";
      case "idle":
        return "Finished and waiting for your next instruction";
      case "error":
        return errorLine(e, named?.noun);
      case "stop": {
        if (e.text === "interrupted") return "Interrupted";
        const msg = firstLine(e.text ?? e.summary);
        return msg && msg !== "Finished" ? `Finished: ${quote(clip(msg, 120))}` : "Finished";
      }
      case "usage_limit":
        // "confirmed" comes from a Claude Code StopFailure or Codex's own usage figures; anything else is a guess (rule 2).
        return e.text === "confirmed" || (!e.text && e.tool === "claude-code") ? "Stopped: usage limit reached" : "Stopped: possibly a usage limit";
      case "unknown":
      default:
        return clip(e.summary, 120);
    }
  })();
  return { ...base, plain };
}

/** Translate a list, keeping order. */
export function translateEvents(events: readonly NormalisedEvent[], ctx: TranslateContext): Translation[] {
  return events.map((e) => translateEvent(e, ctx));
}
