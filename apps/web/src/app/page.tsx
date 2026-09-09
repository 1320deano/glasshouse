import { Landing } from "@/components/Landing";
import { ProductPicker, type ProductFact } from "@/components/ProductPicker";
import { currentViewer } from "@/lib/auth";
import { CONNECT_COMMAND, PRODUCT_NAME, PRODUCTS, SHED_NAME, SITE_NAME } from "@/lib/brand";
import { demoFrames } from "@/lib/demo";
import { PRO_PRICE_GBP } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
/** How many projects the picker will read rooms for. The card is a glance, not a report. */
const FACT_PROJECTS = 8;

/**
 * Home. Signed out (hosted): the landing page. Signed in, or local mode: Deano's front door, the
 * two products side by side, each with one live fact from the record.
 */
export default async function Home() {
  const store = getStore();
  const viewer = await currentViewer();
  if (!viewer) {
    const frames = await demoFrames();
    return <Landing frames={frames} siteName={SITE_NAME} productName={PRODUCT_NAME} shedName={SHED_NAME} priceGbp={PRO_PRICE_GBP} local={false} connectCommand={CONNECT_COMMAND} />;
  }
  const projects = await store.listProjects(viewer.id);
  const sample = projects.slice(0, FACT_PROJECTS);
  const now = Date.now();
  const [rooms, helpers] = await Promise.all([
    Promise.all(sample.map((p) => store.getRoom(p.id).catch(() => null))),
    Promise.all(sample.map((p) => store.listHelpers(p.id).catch(() => []))),
  ]);

  let working = 0;
  let waiting = 0;
  for (const room of rooms) {
    for (const s of room?.sessions ?? []) {
      if (s.endedAt) continue;
      if (now - new Date(s.lastEventAt ?? s.startedAt).getTime() >= ACTIVE_WINDOW_MS) continue;
      working += 1;
      if (s.task?.stage === "waiting") waiting += 1;
    }
  }
  const grown = helpers.reduce((n, list) => n + list.length, 0);
  const placed = helpers.reduce((n, list) => n + list.filter((h) => h.placedAt).length, 0);

  const facts: ProductFact[] = [
    {
      id: "glasshouse",
      fact: projects.length === 0 ? "No project connected yet" : working === 0 ? "Nothing running right now" : `${working} agent${working === 1 ? "" : "s"} working now`,
      attention: waiting > 0 ? `${waiting} waiting for you` : undefined,
    },
    {
      id: "shed",
      fact: grown === 0 ? "No helpers grown yet" : `${grown} helper${grown === 1 ? "" : "s"} grown${placed > 0 ? `, ${placed} placed in your project` : ""}`,
    },
  ];

  return (
    <ProductPicker
      siteName={SITE_NAME}
      products={PRODUCTS}
      facts={facts}
      viewer={{ email: viewer.email, admin: viewer.admin, local: viewer.local }}
      projects={projects.length}
      hour={new Date().getHours()}
      planLabel={store.mode === "local" ? "on this computer" : viewer.plan === "pro" ? "Pro" : "Free"}
    />
  );
}
