/**
 * The area map: one AI call groups the project's files into product areas with plain-English
 * names and one-line descriptions. Stored as path prefixes. The heuristic map is always built
 * first so the Room speaks in areas immediately; the AI map replaces names and descriptions
 * when it arrives. The user's corrections beat both (mergeAreaMaps).
 */
import type { Area, AreaMap, ProjectTree } from "@glasshouse/schema";
import { buildHeuristicAreaMap, groupPathsByFolder, isSensitiveArea, mergeAreaMaps, ownerWordsFor, treeHash } from "@glasshouse/translate";
import { z } from "zod";
import { askForJson } from "./client";

const Reply = z.object({
  areas: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        description: z.string().max(220).default(""),
        prefixes: z.array(z.string().min(1)).min(1).max(40),
      }),
    )
    .min(1)
    .max(20),
});

const SYSTEM = `You name the parts of a software product for its owner, who will never open the code.
Group the folders of a project into 5 to 14 product areas. Each area gets:
- "name": 1 to 3 words the owner would use ("Login", "Payments", "Storyboard generation", "Image uploads"). Never a folder name, never jargon.
- "description": one plain sentence (under 20 words) saying what that part does for the people using the product.
- "prefixes": the folder prefixes from the list that belong to it, copied exactly. Every prefix belongs to at most one area.
Technical plumbing (build settings, shared helpers, tests) can be grouped as "Project setup", "Shared building blocks" or "Automatic checks".
Reply with JSON only: {"areas":[{"name":"...","description":"...","prefixes":["..."]}]}`;

export function areaMapPrompt(tree: ProjectTree): { user: string; groups: Map<string, string[]> } {
  const groups = groupPathsByFolder(tree.paths);
  const lines = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 80)
    .map(([prefix, files]) => {
      const sample = files
        .slice(0, 8)
        .map((f) => f.slice(prefix === "." ? 0 : prefix.length + 1))
        .join(", ");
      return `${prefix} (${files.length} file${files.length === 1 ? "" : "s"}): ${sample}${files.length > 8 ? ", …" : ""}`;
    });
  const manifests = tree.manifests.slice(0, 10).map((m) => `${m.path}: ${[m.name, m.description].filter(Boolean).join(" — ")}${m.dependencies?.length ? ` (uses ${m.dependencies.slice(0, 25).join(", ")})` : ""}`);
  const user = [
    "Folder prefixes (\".\" means files at the top level):",
    ...lines,
    manifests.length > 0 ? "\nProject files say:" : "",
    ...manifests,
    tree.readmeHead ? `\nREADME begins:\n${tree.readmeHead}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { user, groups };
}

/** Turn the AI reply into a map, keeping only prefixes that exist, and covering the rest by folder name. */
export function areaMapFromReply(reply: z.infer<typeof Reply>, groups: Map<string, string[]>, paths: readonly string[], now: string): AreaMap {
  const known = new Set(groups.keys());
  const claimed = new Set<string>();
  const areas: Area[] = [];
  for (const a of reply.areas) {
    const prefixes = a.prefixes.map((p) => p.replace(/\\/g, "/").replace(/\/+$/, "")).filter((p) => known.has(p) && !claimed.has(p));
    if (prefixes.length === 0) continue;
    for (const p of prefixes) claimed.add(p);
    const name = a.name.trim();
    areas.push({
      id: `area-${prefixes[0]!.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "root"}`,
      name,
      description: a.description.trim(),
      prefixes,
      userCorrected: false,
      source: "ai",
      sensitive: isSensitiveArea(name, prefixes),
    });
  }
  for (const prefix of known) {
    if (claimed.has(prefix)) continue;
    const leaf = prefix.split("/").pop()!;
    const words = prefix === "." ? { name: "Project setup", description: "The files at the top of the project that describe how it is built and run" } : ownerWordsFor(leaf);
    const existing = areas.find((a) => a.name === words.name);
    if (existing) existing.prefixes.push(prefix);
    else areas.push({ id: `area-${prefix.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "root"}`, name: words.name, description: words.description, prefixes: [prefix], userCorrected: false, source: "heuristic", sensitive: isSensitiveArea(words.name, [prefix]) });
  }
  return { areas, treeHash: treeHash(paths), generatedAt: now, source: "ai" };
}

/** The AI map, merged over the existing one so corrections survive. Null when AI is off or failed. */
export async function buildAreaMapWithAI(projectId: string, tree: ProjectTree, existing: AreaMap | null): Promise<AreaMap | null> {
  const { user, groups } = areaMapPrompt(tree);
  const reply = await askForJson({ purpose: "area_map", projectId, system: SYSTEM, user, schema: Reply, maxTokens: 4096, effort: "medium" });
  if (!reply) return null;
  const fresh = areaMapFromReply(reply, groups, tree.paths, new Date().toISOString());
  return mergeAreaMaps(existing ?? undefined, fresh);
}

/** The zero-cost map, merged over the existing one. */
export function buildHeuristicMap(tree: ProjectTree, existing: AreaMap | null): AreaMap {
  return mergeAreaMaps(existing ?? undefined, buildHeuristicAreaMap(tree));
}
