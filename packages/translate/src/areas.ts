/**
 * The area map as data: which part of the user's app a path belongs to.
 *
 * - areaForPath: longest-prefix match, the one lookup every translation uses.
 * - buildHeuristicAreaMap: a no-AI first map from the folder structure, so the Room speaks
 *   owner language before (or without) the AI call. The AI map replaces names and descriptions;
 *   the user's corrections beat both.
 * - mergeAreaMaps: how a refresh is applied without losing corrections.
 */
import type { Area, AreaMap, ProjectTree } from "@glasshouse/schema";

export const ROOT_PREFIX = ".";

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");

function prefixMatches(path: string, prefix: string): boolean {
  if (prefix === ROOT_PREFIX) return !path.includes("/");
  return path === prefix || path.startsWith(prefix + "/");
}

/** The area a path belongs to. Longest matching prefix wins; exact file prefixes beat folders. */
export function areaForPath(path: string | undefined, areas: readonly Area[]): Area | undefined {
  if (!path) return undefined;
  const p = norm(path);
  let best: Area | undefined;
  let bestLen = -1;
  for (const a of areas) {
    for (const prefix of a.prefixes) {
      const pre = norm(prefix);
      if (!prefixMatches(p, pre)) continue;
      const len = pre === ROOT_PREFIX ? 0 : pre.length;
      if (len > bestLen) {
        best = a;
        bestLen = len;
      }
    }
  }
  return best;
}

/** Distinct areas for a list of paths, in first-seen order. */
export function areasForPaths(paths: readonly string[], areas: readonly Area[]): Area[] {
  const seen = new Map<string, Area>();
  for (const p of paths) {
    const a = areaForPath(p, areas);
    if (a && !seen.has(a.id)) seen.set(a.id, a);
  }
  return [...seen.values()];
}

/** Areas whose paths the risk badge treats as sensitive. Matched on the name and the folder names. */
const SENSITIVE = /\b(auth|login|sign[- ]?in|session|account|user|password|payment|billing|stripe|checkout|subscription|secret|credential|security|permission|admin|config|setting|env|database|migration|deploy|infra)/i;

export function isSensitiveArea(name: string, prefixes: readonly string[]): boolean {
  return SENSITIVE.test(name) || prefixes.some((p) => SENSITIVE.test(p.split("/").pop() ?? p));
}

/** Folder names -> owner words. Order matters only for readability. */
const FOLDER_WORDS: Array<[RegExp, string, string]> = [
  [/^(auth|authn|login|signin|sign-in|session|sessions|oauth|sso)$/i, "Login", "How people sign in and stay signed in"],
  [/^(users?|accounts?|profiles?|members?)$/i, "Accounts", "Who the users are and what is stored about them"],
  [/^(payments?|billing|stripe|checkout|subscriptions?|invoices?|pricing)$/i, "Payments", "How money is taken and subscriptions are managed"],
  [/^(admin|backoffice|staff)$/i, "Admin", "Tools for the people who run the app"],
  [/^(dashboard|overview|home)$/i, "Dashboard", "The main screen people see after signing in"],
  [/^(api|routes?|server|backend|handlers?|controllers?|endpoints?)$/i, "Behind the scenes", "How the app answers requests from the screens"],
  [/^(components?|ui|widgets?|elements?)$/i, "Screen parts", "The buttons, forms and panels the screens are built from"],
  [/^(pages?|views?|screens?|app)$/i, "Screens", "The pages people visit"],
  [/^(db|database|migrations?|prisma|drizzle|supabase|sql|models?|entities|schema|schemas)$/i, "Database", "How the app's information is stored and laid out"],
  [/^(tests?|__tests__|spec|specs|e2e|cypress|playwright)$/i, "Automatic checks", "Small automatic checks that prove the app still works"],
  [/^(docs?|documentation|wiki)$/i, "Documentation", "Notes and guides written for people"],
  [/^(config|configs?|settings|\.config)$/i, "Settings", "Configuration that changes how the app behaves"],
  [/^(scripts?|tools?|bin|tasks?|ops)$/i, "Helper scripts", "Small programs the team runs by hand"],
  [/^(public|static|assets?|images?|img|media|fonts?)$/i, "Images and files", "Pictures, fonts and other files served as they are"],
  [/^(styles?|css|scss|theme|themes)$/i, "Look and feel", "Colours, fonts and layout"],
  [/^(lib|libs?|utils?|utilities|helpers?|shared|common|core|internal)$/i, "Shared building blocks", "Pieces of code used all over the app"],
  [/^(emails?|mail|mailer|notifications?|messaging|sms)$/i, "Emails and notifications", "Messages the app sends to people"],
  [/^(uploads?|storage|files?|media-library)$/i, "Uploads and files", "How files people upload are stored"],
  [/^(search|indexing)$/i, "Search", "How people find things in the app"],
  [/^(analytics|metrics|tracking|telemetry|stats)$/i, "Analytics", "Counting what people do in the app"],
  [/^(i18n|locales?|translations?|lang)$/i, "Translations", "The app's words in other languages"],
  [/^(infra|infrastructure|deploy|deployment|docker|k8s|kubernetes|terraform|\.github|ci|\.circleci)$/i, "Deployment", "How the app is built and put online"],
  [/^(fixtures?|seeds?|samples?|examples?|mocks?)$/i, "Sample data", "Example data used for trying things out"],
  [/^(types?|typings|interfaces?|contracts?)$/i, "Data shapes", "Definitions of what the app's information looks like"],
  [/^(workers?|jobs?|queues?|cron|background)$/i, "Background jobs", "Work the app does on its own, behind the scenes"],
  [/^(hooks?|middleware|middlewares|guards?|interceptors?|plugins?)$/i, "In-between checks", "Steps that run before or after other work"],
  [/^(ai|llm|prompts?|agents?|ml)$/i, "AI features", "The parts that talk to an AI model"],
  [/^(integrations?|connectors?|adapters?|providers?|services?|clients?)$/i, "Connections to other services", "How the app talks to outside services"],
  [/^(store|stores?|state|redux|context)$/i, "App memory", "What the screens remember while they are open"],
  [/^(cli|command|commands)$/i, "Command line", "The version of the app run from a terminal"],
  [/^(web|website|frontend|client)$/i, "The website", "Everything people see in the browser"],
  [/^(mobile|ios|android|native)$/i, "The mobile app", "The version of the app on phones"],
  [/^(docs-site|blog|marketing|landing)$/i, "Marketing site", "The public pages that sell the product"],
];

/** "storyboard-generation" -> "Storyboard generation" */
export function humaniseFolder(name: string): string {
  const words = name
    .replace(/^[._@]+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return "Other";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const GENERIC_PACKAGE = /^(web|website|frontend|client|api|server|backend|mobile|ios|android|docs?|shared|common|core|utils?|ui|components?|cli|db|database|infra|e2e|tests?|admin|dashboard|auth|payments?|billing)$/i;

/**
 * Owner words for a folder. `isPackage` marks a child of apps/ or packages/, whose name is usually
 * the team's own word for that part (keep it) unless it is one of the generic names above.
 */
export function ownerWordsFor(folder: string, isPackage = false): { name: string; description: string } {
  if (!isPackage || GENERIC_PACKAGE.test(folder)) {
    for (const [re, name, description] of FOLDER_WORDS) if (re.test(folder)) return { name, description };
  }
  const name = humaniseFolder(folder);
  return { name, description: `The part of the app kept under “${name.toLowerCase()}”` };
}

const CONTAINER_DIRS = /^(apps?|packages?|services?|libs?|modules?|workspaces?|projects?|src|source|lib)$/i;
const MAX_AREAS = 24;

/** Compact 32-bit FNV-1a hash of the sorted path list. A fingerprint for "did the tree change?". */
export function treeHash(paths: readonly string[]): string {
  const sorted = [...paths].map(norm).sort();
  let h = 0x811c9dc5;
  for (const p of sorted) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x0a;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${sorted.length}-${h.toString(16).padStart(8, "0")}`;
}

/**
 * Group paths by folder. Container folders (apps/, packages/, src/) are looked through so that
 * `apps/web` and `packages/connector` become areas rather than one giant "Apps".
 */
export function groupPathsByFolder(paths: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const raw of paths) {
    const p = norm(raw);
    const parts = p.split("/");
    if (parts.length === 1) {
      push(groups, ROOT_PREFIX, p);
      continue;
    }
    let key = parts[0]!;
    if (CONTAINER_DIRS.test(parts[0]!) && parts.length > 2) {
      key = `${parts[0]}/${parts[1]}`;
      // apps/web/src/lib/... -> look through a second `src`
      if (CONTAINER_DIRS.test(parts[2]!) && parts.length > 4) key = `${key}/${parts[2]}/${parts[3]}`;
    }
    push(groups, key, p);
  }
  return groups;
}

function push(m: Map<string, string[]>, k: string, v: string) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

export function areaId(prefix: string): string {
  return `area-${prefix.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "root"}`;
}

/** A first map from folder names alone. No AI, no I/O. Good enough to speak in areas on day one. */
export function buildHeuristicAreaMap(tree: Pick<ProjectTree, "paths">, opts: { now?: () => string } = {}): AreaMap {
  const groups = groupPathsByFolder(tree.paths);
  const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const areas: Area[] = [];
  const usedNames = new Map<string, number>();
  const overflow: string[] = [];

  for (const [prefix, files] of entries) {
    if (prefix === ROOT_PREFIX) continue;
    if (areas.length >= MAX_AREAS - 1) {
      overflow.push(prefix);
      continue;
    }
    const parts = prefix.split("/");
    const leaf = parts[parts.length - 1]!;
    const words = ownerWordsFor(leaf, parts.length === 2 && CONTAINER_DIRS.test(parts[0]!) && !/^(src|source|lib)$/i.test(parts[0]!));
    let name = words.name;
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);
    if (count > 0) name = `${name} (${humaniseFolder(prefix.split("/")[0]!).toLowerCase()})`;
    areas.push({
      id: areaId(prefix),
      name,
      description: words.description,
      prefixes: [prefix],
      userCorrected: false,
      source: "heuristic",
      sensitive: isSensitiveArea(name, [prefix]) || files.some((f) => /(^|\/)\.env|secret|credential/i.test(f)),
    });
  }
  if (overflow.length > 0) {
    areas.push({ id: "area-other", name: "Other parts", description: "Smaller folders grouped together", prefixes: overflow, userCorrected: false, source: "heuristic", sensitive: false });
  }
  if (groups.has(ROOT_PREFIX)) {
    areas.push({
      id: "area-project-setup",
      name: "Project setup",
      description: "The files at the top of the project that describe how it is built and run",
      prefixes: [ROOT_PREFIX],
      userCorrected: false,
      source: "heuristic",
      sensitive: true,
    });
  }
  return { areas, treeHash: treeHash(tree.paths), generatedAt: opts.now?.() ?? new Date().toISOString(), source: "heuristic" };
}

/**
 * Apply a fresh map (AI or heuristic) on top of the existing one.
 * - Areas the user corrected are kept exactly, and keep the prefixes they own.
 * - Fresh areas lose any prefix a corrected area already owns; if nothing is left they are dropped.
 * - A fresh area whose prefixes match an existing uncorrected area keeps that area's id, so events
 *   already labelled with it stay attached.
 */
export function mergeAreaMaps(existing: AreaMap | undefined, fresh: AreaMap): AreaMap {
  if (!existing) return fresh;
  const corrected = existing.areas.filter((a) => a.userCorrected);
  const owned = new Set(corrected.flatMap((a) => a.prefixes.map(norm)));
  const byPrefix = new Map<string, Area>();
  for (const a of existing.areas) if (!a.userCorrected) for (const p of a.prefixes) byPrefix.set(norm(p), a);

  const merged: Area[] = [...corrected];
  const usedIds = new Set(corrected.map((a) => a.id));
  for (const f of fresh.areas) {
    const prefixes = f.prefixes.filter((p) => !owned.has(norm(p)));
    if (prefixes.length === 0) continue;
    const previous = prefixes.map((p) => byPrefix.get(norm(p))).find((a) => a && !usedIds.has(a.id));
    const id = previous?.id ?? f.id;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    merged.push({ ...f, id, prefixes, sensitive: f.sensitive || isSensitiveArea(f.name, prefixes) });
  }
  return { ...fresh, areas: merged };
}

/** Has the tree changed enough to rebuild the map? New or removed files above a share, or a new top-level group. */
export function treeChangedMaterially(oldPaths: readonly string[], newPaths: readonly string[], share = 0.15): boolean {
  const a = new Set(oldPaths.map(norm));
  const b = new Set(newPaths.map(norm));
  if (a.size === 0) return b.size > 0;
  let diff = 0;
  for (const p of a) if (!b.has(p)) diff++;
  for (const p of b) if (!a.has(p)) diff++;
  if (diff / Math.max(a.size, b.size) > share) return true;
  const oldGroups = new Set(groupPathsByFolder([...a]).keys());
  for (const g of groupPathsByFolder([...b]).keys()) if (!oldGroups.has(g)) return true;
  return false;
}

/** User corrections. Pure: return the new map. */
export function renameArea(map: AreaMap, id: string, name: string, description?: string): AreaMap {
  return {
    ...map,
    areas: map.areas.map((a) => (a.id === id ? { ...a, name: name.trim() || a.name, description: description?.trim() ?? a.description, userCorrected: true, source: "user" as const, sensitive: isSensitiveArea(name, a.prefixes) } : a)),
  };
}

export function mergeAreas(map: AreaMap, fromId: string, intoId: string): AreaMap {
  if (fromId === intoId) return map;
  const from = map.areas.find((a) => a.id === fromId);
  const into = map.areas.find((a) => a.id === intoId);
  if (!from || !into) return map;
  return {
    ...map,
    areas: map.areas
      .filter((a) => a.id !== fromId)
      .map((a) => (a.id === intoId ? { ...a, prefixes: [...new Set([...a.prefixes, ...from.prefixes])], userCorrected: true, source: "user" as const, sensitive: a.sensitive || from.sensitive } : a)),
  };
}
