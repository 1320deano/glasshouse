import { redirect } from "next/navigation";
import { Landing } from "@/components/Landing";
import { currentViewer } from "@/lib/auth";
import { CONNECT_COMMAND, PRODUCT_NAME } from "@/lib/brand";
import { demoFrames } from "@/lib/demo";
import { PRO_PRICE_GBP } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Home. Signed out (hosted): the landing page. Signed in, or local mode: your projects, straight
 * into the Room when there is only one.
 */
export default async function Home() {
  const store = getStore();
  const viewer = await currentViewer();
  if (!viewer) {
    const frames = await demoFrames();
    return <Landing frames={frames} productName={PRODUCT_NAME} priceGbp={PRO_PRICE_GBP} local={false} connectCommand={CONNECT_COMMAND} />;
  }
  const projects = await store.listProjects(viewer.id);
  if (projects.length === 1) redirect(`/room/${projects[0]!.id}`);
  if (projects.length === 0) redirect("/connect");

  return (
    <main className="room">
      <div className="room-header">
        <div>
          <strong>{PRODUCT_NAME}</strong>
        </div>
        <div className="room-links">
          <a href="/connect">New project</a>
          {!viewer.local && <a href="/account">{viewer.email ?? "Account"}</a>}
          {viewer.admin && <a href="/admin">Testers</a>}
          <span>{store.mode === "local" ? "on this computer" : viewer.plan === "pro" ? "Pro" : "Free"}</span>
        </div>
      </div>
      <div className="section-title">Your projects</div>
      <ul className="projects">
        {projects.map((p) => (
          <li key={p.id}>
            <a href={`/room/${p.id}`}>{p.name}</a>
            {p.rootHint && <span className="muted small"> · {p.rootHint}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
