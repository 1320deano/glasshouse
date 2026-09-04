/**
 * A plain-English noun for a file, so templates can say "Looking at how logged-in users are
 * identified" instead of "Reading auth/session.py".
 *
 * Two sources, in order: a cached description (written by the AI once per file, or by the
 * user), else this heuristic from the file name. The heuristic never invents behaviour; it
 * names the thing ("the session part of Login") and lets the AI fill in what it does.
 */

const WORD_MAP: Record<string, string> = {
  auth: "sign-in",
  authn: "sign-in",
  authz: "permissions",
  utils: "helpers",
  util: "helpers",
  config: "settings",
  cfg: "settings",
  conf: "settings",
  db: "database",
  api: "server",
  ui: "screen",
  cli: "command line",
  lib: "library",
  idx: "index",
  env: "environment settings",
  middleware: "in-between checks",
  schema: "data shapes",
  schemas: "data shapes",
  dto: "data shapes",
  impl: "",
  src: "",
  main: "main",
  app: "app",
  svc: "service",
  ctx: "context",
  fn: "",
  tsx: "",
  jsx: "",
  spec: "",
  test: "",
  tests: "",
  e2e: "end-to-end",
  i18n: "translations",
  msg: "message",
  msgs: "messages",
  btn: "button",
  nav: "navigation",
  pwd: "password",
  usr: "user",
  acct: "account",
  txn: "transaction",
  repo: "storage",
  hdlr: "handler",
};

export function fileWords(base: string): string {
  const words = base
    .replace(/\.[^.]+$/, "")
    .replace(/\.(test|spec|stories|d)$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.[\]()@]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w in WORD_MAP ? WORD_MAP[w]! : w))
    .filter(Boolean);
  return words.join(" ");
}

const basename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;
const inFolder = (p: string, re: RegExp) => p.replace(/\\/g, "/").split("/").slice(0, -1).some((d) => re.test(d));

/**
 * Describe a file as a noun phrase that fits after "Looking at" / "Changing".
 * `area` is the plain-English area name, used to anchor generic files.
 */
export function describeFile(path: string, area?: string): string {
  const p = path.replace(/\\/g, "/");
  const base = basename(p);
  const lower = base.toLowerCase();
  const words = fileWords(base);
  const inArea = area ? ` in ${area}` : "";
  const of = area ? ` of ${area}` : "";

  if (/^readme/i.test(lower)) return "the project's notes for people";
  if (/^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|gemfile|composer\.json|pom\.xml|build\.gradle)$/.test(lower)) return "the project's list of tools and settings";
  if (/^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|poetry\.lock|cargo\.lock|go\.sum|gemfile\.lock)$/.test(lower)) return "the exact versions of the tools the project uses";
  if (/^\.env/.test(lower) || /\.(pem|key)$/.test(lower) || /secret|credential/.test(lower)) return "secret settings";
  if (/^(dockerfile|docker-compose)/.test(lower) || inFolder(p, /^\.github$|^workflows$|^\.circleci$|^infra$|^deploy$/)) return "how the app is built and put online";
  if (/^(tsconfig|jsconfig|eslint|prettier|vitest|jest|next|vite|webpack|babel|tailwind|postcss|nuxt|svelte|astro)[.a-z]*\.(json|js|cjs|mjs|ts|mts)$/.test(lower) || /\.config\.[a-z]+$/.test(lower)) return `settings for the ${fileWords(base.split(".")[0]!)} tool`;
  if (/\.sql$/.test(lower) || inFolder(p, /^migrations?$/)) return "the database layout";
  if (/\.(test|spec)\.[a-z]+$/.test(lower) || inFolder(p, /^(__tests__|tests?|spec|e2e)$/)) return `the automatic checks for ${words || area || "the app"}`;
  if (/\.(css|scss|sass|less|styl)$/.test(lower)) return `how ${words === "globals" || words === "global" || words === "styles" ? area ?? "the app" : words} looks`;
  if (/^(page|index|layout)\.(tsx|jsx|vue|svelte|html|astro)$/.test(lower) || /^(route|layout)\.(ts|js|tsx|jsx)$/.test(lower) || /^index\.html$/.test(lower)) {
    const folder = p.split("/").slice(-2, -1)[0];
    const what = folder && !/^(app|src|pages)$/.test(folder) ? fileWords(folder.replace(/[[\]()]/g, "")) : area ?? "main";
    if (lower.startsWith("layout")) return `the frame around the ${what} pages`;
    if (lower.startsWith("route")) return `how the app answers requests about ${what}`;
    return `the ${what} page`;
  }
  if (inFolder(p, /^(api|routes?|handlers?|controllers?|endpoints?)$/)) return `how the app answers requests about ${words || area || "this"}`;
  if (inFolder(p, /^(components?|ui|widgets?)$/) || /\.(tsx|jsx|vue|svelte)$/.test(lower)) return `the ${words || "main"} part of the screen${inArea}`;
  if (/\.md$/.test(lower)) return `the notes on ${words || area || "the project"}`;
  if (/\.(json|ya?ml|toml|ini)$/.test(lower)) return `the ${words || "project"} settings${inArea}`;
  if (/\.(png|jpe?g|gif|svg|webp|ico|mp4|mp3|woff2?|ttf)$/.test(lower)) return `an image or media file${inArea}`;
  if (/^(index|main|app|server|cli)\.[a-z]+$/.test(lower)) return `the starting point${of || " of the app"}`;
  if (inFolder(p, /^(models?|entities|schemas?|types?)$/)) return `how ${words || "this"} information is shaped${inArea}`;
  if (inFolder(p, /^(hooks?)$/)) return `the ${words} helper${inArea}`;
  return words ? `the ${words} part${of || " of the app"}` : `a file${inArea}`;
}

/** Short label for the location line: "Login → session". */
export function shortFileLabel(path: string): string {
  return fileWords(basename(path)) || basename(path);
}
