/**
 * Design QA: shoot every screen at a phone width and a desktop width, including the empty,
 * loading and error states, so the whole product can be looked at side by side.
 *
 *   pnpm dev                                  # with GLASSHOUSE_LOCAL_STORE set
 *   pnpm tsx scripts/seed-demo.ts             # realistic data
 *   node scripts/design-screenshots.mjs out/  # writes <name>-<width>.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

/**
 * Runs in the page. Walks every element that paints text, works out the background it is actually
 * sitting on, and reports anything under the WCAG AA ratio for its size. Catches the contrast
 * mistakes a screenshot alone will not: a token used on the wrong surface, a "quiet" colour that
 * has quietly stopped being readable.
 */
const CONTRAST_AUDIT = () => {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(",").map((n) => parseFloat(n));
    return { r, g, b, a };
  };
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const backdrop = (el) => {
    let node = el;
    let stack = { r: 255, g: 255, b: 255, a: 1 };
    const layers = [];
    while (node) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) layers.push(bg);
      if (bg && bg.a === 1) break;
      node = node.parentElement;
    }
    for (const layer of layers.reverse()) stack = over(layer, stack);
    return stack;
  };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.95) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const c1 = lum(over(fg, backdrop(el)));
    const c2 = lum(backdrop(el));
    const ratio = (Math.max(c1, c2) + 0.05) / (Math.min(c1, c2) + 0.05);
    if (ratio < need) out.push({ text: text.slice(0, 60), cls: el.className && String(el.className).slice(0, 50), color: cs.color, size, ratio: Math.round(ratio * 100) / 100, need });
  }
  return out;
};

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3000";
const OUT = process.argv[2] ?? "shots";
const ONLY = process.env.SHOT_ONLY ? new Set(process.env.SHOT_ONLY.split(",")) : null;
const WIDTHS = [
  { w: 390, h: 844, tag: "390" },
  { w: 1440, h: 900, tag: "1440" },
];

const json = async (p) => (await fetch(`${BASE}${p}`)).json();

/** The Room's phone tabs only answer once the page has hydrated; click until one takes. */
async function pickTab(page, name) {
  const tab = page.getByRole("tab", { name });
  for (let i = 0; i < 12; i++) {
    await tab.click();
    await page.waitForTimeout(400);
    if ((await tab.getAttribute("aria-selected")) === "true") break;
  }
  await page.waitForTimeout(600);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { projects } = await json("/api/projects/link");
  const busy = projects.find((p) => p.name === "storyboard") ?? projects[0];
  const quiet = projects.find((p) => p.name === "marketing-site") ?? projects[0];

  /** name -> { path, prepare?, act?, full? } */
  const screens = [
    { name: "landing", path: "/landing", full: true },
    { name: "projects", path: "/" },
    { name: "room", path: `/room/${busy.id}`, full: true },
    {
      name: "room-expanded",
      path: `/room/${busy.id}`,
      full: true,
      act: async (page) => {
        const btn = page.locator("[data-shot='expand']").first();
        if (await btn.count()) await btn.click();
        else await page.getByRole("button", { name: /expand/i }).first().click();
        await page.waitForTimeout(1200);
      },
    },
    { name: "room-empty", path: `/room/${quiet.id}` },
    {
      name: "room-phone-story",
      path: `/room/${busy.id}`,
      only: "390",
      act: (page) => pickTab(page, /story/i),
    },
    {
      name: "room-phone-progress",
      path: `/room/${busy.id}`,
      only: "390",
      full: true,
      act: (page) => pickTab(page, /progress/i),
    },
    { name: "areas", path: `/room/${busy.id}/areas`, full: true },
    { name: "digest", path: `/room/${busy.id}/digest`, full: true },
    { name: "inbox", path: `/room/${busy.id}/inbox`, full: true },
    { name: "inbox-empty", path: `/room/${quiet.id}/inbox` },
    { name: "feedback-empty", path: `/room/${quiet.id}/feedback` },
    { name: "account", path: "/account", full: true },
    { name: "admin", path: "/admin", full: true },
    { name: "connect", path: "/connect", full: true },
    { name: "signin", path: "/signin?preview=1" },
    { name: "signup", path: "/signup?preview=1" },
    { name: "not-found", path: "/room/00000000-0000-4000-8000-000000000000" },
    {
      name: "digest-loading",
      path: `/room/${busy.id}/digest`,
      prepare: async (page) => page.route("**/api/digest/**", async (route) => { await new Promise((r) => setTimeout(r, 20000)); await route.abort(); }),
      settle: 900,
    },
    {
      name: "digest-error",
      path: `/room/${busy.id}/digest`,
      prepare: async (page) => page.route("**/api/digest/**", (route) => route.fulfill({ status: 500, body: "{}" })),
    },
    {
      name: "inbox-error",
      path: `/room/${busy.id}/inbox`,
      prepare: async (page) => page.route("**/api/inbox/**", (route) => route.fulfill({ status: 500, body: "{}" })),
    },
    {
      name: "room-offline",
      path: `/room/${busy.id}`,
      prepare: async (page) => {
        await page.route("**/api/live**", (route) => route.abort());
        await page.route("**/api/room/**", (route) => route.abort());
      },
    },
    {
      // The first stop for a keyboard user: the skip link, which is invisible until it is focused.
      name: "focus-skip-link",
      path: `/room/${busy.id}`,
      act: async (page) => {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(300);
      },
    },
    {
      name: "focus-controls",
      path: `/room/${busy.id}`,
      act: async (page) => {
        for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
        await page.evaluate(() => document.activeElement?.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
      },
    },
    {
      name: "focus-field",
      path: `/room/${busy.id}/areas`,
      act: async (page) => {
        for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
        await page.evaluate(() => document.activeElement?.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
      },
    },
  ];

  const chromePath = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/opt/pw-browsers/chromium");
  const browser = await chromium.launch({ executablePath: chromePath });
  const shot = async (screen, size) => {
    const context = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, colorScheme: "light" });
    // The Next.js dev-mode badge is not part of the design.
    await context.addInitScript(() => {
      const hide = () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}";
        document.head?.appendChild(s);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide);
      else hide();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    if (screen.prepare) await screen.prepare(page);
    await page.goto(`${BASE}${screen.path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(screen.settle ?? 2600);
    if (screen.act) await screen.act(page).catch((e) => errors.push(`act: ${e}`));
    const file = join(OUT, `${screen.name}-${size.tag}.png`);
    // The working dot pulses forever; freeze animations so the shot does not wait on them. A shot
    // that still cannot be taken is reported, not fatal: the rest of the product is still worth seeing.
    await page.screenshot({ path: file, fullPage: Boolean(screen.full), animations: "disabled", timeout: 45000 }).catch((e) => errors.push(`screenshot: ${String(e).slice(0, 120)}`));
    const contrast = await page.evaluate(CONTRAST_AUDIT).catch(() => []);
    await context.close();
    return { file, errors, contrast };
  };

  const report = [];
  for (const screen of screens) {
    if (ONLY && !ONLY.has(screen.name)) continue;
    for (const size of WIDTHS) {
      if (screen.only && screen.only !== size.tag) continue;
      const r = await shot(screen, size);
      report.push({ screen: screen.name, width: size.tag, ...r });
      writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
      console.log(`${r.file}${r.errors.length ? `  ⚠ ${r.errors.length} console errors` : ""}${r.contrast.length ? `  ✖ ${r.contrast.length} contrast failures` : ""}`);
    }
  }
  await browser.close();
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
}

void main();
