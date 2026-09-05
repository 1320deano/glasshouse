import { redirect } from "next/navigation";
import { Landing } from "@/components/Landing";
import { PageHeader } from "@/components/PageHeader";
import { ChevronRight } from "@/components/icons";
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
    <main className="page">
      <PageHeader
        brand={PRODUCT_NAME}
        title="Your projects"
        right={
          <>
            <a className="nav-link" href="/connect">
              New project
            </a>
            {!viewer.local && (
              <a className="nav-link" href="/account">
                {viewer.email ?? "Account"}
              </a>
            )}
            {viewer.admin && (
              <a className="nav-link" href="/admin">
                Testers
              </a>
            )}
            <span className="live-state">{store.mode === "local" ? "on this computer" : viewer.plan === "pro" ? "Pro" : "Free"}</span>
          </>
        }
      />

      <div className="page-intro">
        <h1>Your projects</h1>
        <p>Each one is a folder an agent works in. Open a project to see what is happening in it right now.</p>
      </div>

      <ul className="projects">
        {projects.map((p) => (
          <li key={p.id}>
            <a className="project-card" href={`/room/${p.id}`}>
              <span className="project-main">
                <span className="project-name">{p.name}</span>
                {p.rootHint && <span className="project-root">{p.rootHint}</span>}
              </span>
              <ChevronRight />
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
