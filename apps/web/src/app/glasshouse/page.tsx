import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ChevronRight } from "@/components/icons";
import { currentViewer } from "@/lib/auth";
import { PRODUCT_NAME, SITE_NAME } from "@/lib/brand";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Glasshouse's own door: your projects, straight into the Room when there is only one.
 * Signed-out visitors are sent to sign in by the middleware (hosted) or never get here (local).
 */
export default async function GlasshouseHome() {
  const store = getStore();
  const viewer = await currentViewer();
  if (!viewer) redirect("/signin?next=/glasshouse");
  const projects = await store.listProjects(viewer.id);
  if (projects.length === 1) redirect(`/room/${projects[0]!.id}`);
  if (projects.length === 0) redirect("/connect");

  return (
    <main className="page">
      <PageHeader
        back="/"
        backLabel={SITE_NAME}
        title={PRODUCT_NAME}
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
