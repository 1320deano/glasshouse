import type { HelperBrief, HelperRecord } from "../store/types";

/** A file-safe name for a helper: lower-case, hyphens, nothing a shell or a tool would trip on. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "helper";
}

/** The slug, or the slug with -2, -3... when another helper in the project already has it. */
export function uniqueSlug(want: string, taken: Set<string>): string {
  const base = slugify(want);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now()}`;
}

/** True when the words that reach the project folder have not changed, so "placed" still holds. */
export function sameBrief(a: Pick<HelperRecord, "slug" | "name" | "brief">, b: Pick<HelperRecord, "slug" | "name" | "brief">): boolean {
  return a.slug === b.slug && a.name === b.name && JSON.stringify(normaliseBrief(a.brief)) === JSON.stringify(normaliseBrief(b.brief));
}

function normaliseBrief(b: HelperBrief): HelperBrief {
  return {
    job: b.job.trim(),
    mayTouch: [...b.mayTouch].sort(),
    mustNotTouch: [...b.mustNotTouch].sort(),
    stopAndAsk: b.stopAndAsk.map((s) => s.trim()).filter(Boolean),
    care: b.care,
    rules: b.rules.map((r) => ({ text: r.text.trim() })),
    tools: [...b.tools].sort(),
  };
}
