/**
 * The files a helper becomes, and how they are merged into a project folder. Shared by the web
 * app (which compiles them) and the connector (which writes them), so both agree on the markers.
 *
 * Claude Code and Cursor get one file per helper. Codex reads AGENTS.md, so a helper is a marked
 * section of that file: rewritten in place on every pull, removed when the helper is deleted, and
 * the owner's own words around it are never touched.
 */

export type HelperTool = "claude-code" | "codex" | "cursor";

export interface CompiledFile {
  tool: HelperTool;
  /** Relative to the project root, forward slashes. */
  path: string;
  body: string;
  /** How the file is written: on its own, or as a marked section merged into a shared file. */
  mode: "file" | "section";
  /** For sections: the markers the connector looks for. */
  marker?: { start: string; end: string };
}

export const codexMarkers = (slug: string) => ({ start: `<!-- deano:helper:${slug} -->`, end: `<!-- /deano:helper:${slug} -->` });

/** Merge a marked section into an existing file's text: replace the old section, or append. */
export function mergeSection(existing: string, section: Pick<CompiledFile, "body" | "marker">): string {
  if (!section.marker) return section.body;
  const { start, end } = section.marker;
  const i = existing.indexOf(start);
  const j = existing.indexOf(end);
  if (i >= 0 && j > i) return existing.slice(0, i) + section.body + existing.slice(j + end.length);
  const base = existing.replace(/\s*$/, "");
  return base ? `${base}\n\n${section.body}\n` : `${section.body}\n`;
}

/** Remove a marked section (a helper the owner deleted). Text outside the markers is untouched. */
export function removeSection(existing: string, slug: string): string {
  const { start, end } = codexMarkers(slug);
  const i = existing.indexOf(start);
  const j = existing.indexOf(end);
  if (i < 0 || j < i) return existing;
  return (existing.slice(0, i).replace(/\s*$/, "") + "\n" + existing.slice(j + end.length).replace(/^\s*/, "")).replace(/^\n+/, "");
}

/** Every helper slug that has a section in the text. */
export function sectionSlugs(existing: string): string[] {
  return [...existing.matchAll(/<!-- deano:helper:([a-z0-9-]+) -->/g)].map((m) => m[1]!);
}
