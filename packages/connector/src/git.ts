/**
 * Commits landing in a linked project become `commit` events. Polls `.git/logs/HEAD` (cheap: one
 * stat) and reads new commits with `git log` when it changes. No git? No repo? Then nothing.
 */
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

export async function headLogMtime(root: string): Promise<number | undefined> {
  for (const rel of [".git/logs/HEAD", ".git/HEAD"]) {
    try {
      return (await stat(join(root, rel))).mtimeMs;
    } catch {
      /* try the next */
    }
  }
  return undefined;
}

export async function headHash(root: string): Promise<string | undefined> {
  try {
    return (await git(["rev-parse", "HEAD"], root)).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse `git log --format=%x1e%H%x1f%an%x1f%aI%x1f%B --name-only` output. Each record is
 * `HASH\x1fAUTHOR\x1fDATE\x1fMESSAGE`, a blank line, then one file per line.
 */
export function parseGitLog(out: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const chunk of out.split("\x1e")) {
    if (!chunk.trim()) continue;
    const [hash, author, date, rest = ""] = chunk.split("\x1f");
    if (!hash?.trim()) continue;
    const lines = rest.replace(/\s+$/, "").split("\n");
    const files: string[] = [];
    while (lines.length > 0) {
      const l = lines[lines.length - 1]!;
      if (l.trim() === "" || /\s/.test(l.trim())) break;
      files.unshift(l.trim());
      lines.pop();
    }
    commits.push({ hash: hash.trim(), author: (author ?? "").trim(), date: (date ?? "").trim(), message: lines.join("\n").trim(), files });
  }
  return commits;
}

/** Commits after `since` (exclusive), oldest first. Without `since`, the last `fallback` commits. */
export async function commitsSince(root: string, since: string | undefined, fallback = 5): Promise<CommitInfo[]> {
  const range = since ? [`${since}..HEAD`] : [`-n${fallback}`];
  try {
    const out = await git(["log", "--format=%x1e%H%x1f%an%x1f%aI%x1f%B", "--name-only", "--reverse", ...range], root);
    return parseGitLog(out);
  } catch {
    if (since) return commitsSince(root, undefined, fallback); // `since` may have been rewritten away
    return [];
  }
}
