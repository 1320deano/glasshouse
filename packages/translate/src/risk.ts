/**
 * The risk badge, from facts only (rule 2). Every reason is something the user could check:
 * the areas the changed files fall in, the files themselves, whether anything was installed.
 */
import type { Area, Risk, RiskLevel } from "@glasshouse/schema";
import { areasForPaths } from "./areas.js";

export interface RiskFacts {
  /** Files the task has changed so far (relative paths). */
  changedPaths: readonly string[];
  areas: readonly Area[];
  /** Number of dependency installs in the task. */
  installs: number;
}

const SECRET = /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$|id_rsa|id_ed25519|(^|\/)secrets?(\/|$)|credential/i;
const SETTINGS = /(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod|gemfile|composer\.json|dockerfile|docker-compose[^/]*|[^/]*\.config\.[a-z]+|tsconfig[^/]*\.json|\.github\/workflows\/[^/]+|vercel\.json|netlify\.toml|fly\.toml|supabase\/config\.toml)$/i;
const DATABASE = /(^|\/)migrations?\/|\.sql$|(^|\/)(prisma|drizzle)\//i;

const order: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** The changed files that count as secrets, settings or database layout. Facts for the report card's evidence. */
export function sensitiveFiles(paths: readonly string[]): { secrets: string[]; settings: string[]; database: string[] } {
  const unique = [...new Set(paths)];
  return {
    secrets: unique.filter((p) => SECRET.test(p)),
    settings: unique.filter((p) => SETTINGS.test(p) && !SECRET.test(p)),
    database: unique.filter((p) => DATABASE.test(p)),
  };
}
const max = (a: RiskLevel, b: RiskLevel): RiskLevel => (order[a] >= order[b] ? a : b);

export function assessRisk(facts: RiskFacts): Risk {
  let level: RiskLevel = "low";
  const reasons: string[] = [];
  const paths = [...new Set(facts.changedPaths)];

  const touched = areasForPaths(paths, facts.areas);
  const sensitive = touched.filter((a) => a.sensitive);
  for (const a of sensitive) {
    level = max(level, "high");
    reasons.push(`Changes ${a.name}`);
  }

  const secrets = paths.filter((p) => SECRET.test(p));
  if (secrets.length > 0) {
    level = max(level, "high");
    reasons.push(secrets.length === 1 ? "Touches a secrets file" : `Touches ${secrets.length} secrets files`);
  }
  const db = paths.filter((p) => DATABASE.test(p));
  if (db.length > 0) {
    level = max(level, "high");
    reasons.push("Changes the database layout");
  }
  const settings = paths.filter((p) => SETTINGS.test(p) && !SECRET.test(p));
  if (settings.length > 0) {
    level = max(level, "medium");
    reasons.push(settings.length === 1 ? "Changes a settings file" : `Changes ${settings.length} settings files`);
  }
  if (facts.installs > 0) {
    level = max(level, "medium");
    reasons.push(facts.installs === 1 ? "Adds a new tool to the project" : `Adds ${facts.installs} new tools to the project`);
  }
  if (paths.length >= 25) {
    level = max(level, "high");
    reasons.push(`${paths.length} files changed`);
  } else if (paths.length >= 10) {
    level = max(level, "medium");
    reasons.push(`${paths.length} files changed`);
  }
  if (touched.length >= 4) {
    level = max(level, "medium");
    reasons.push(`Spans ${touched.length} parts of the app`);
  }

  if (reasons.length === 0) {
    if (paths.length === 0) reasons.push("No files changed yet");
    else if (touched.length === 0) reasons.push(`${paths.length} file${paths.length === 1 ? "" : "s"} changed, outside any known part of the app`);
    else reasons.push(`Only ${touched.map((a) => a.name).join(" and ")} changed`);
  }
  return { level, reasons };
}

export const RISK_LABELS: Record<RiskLevel, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };
