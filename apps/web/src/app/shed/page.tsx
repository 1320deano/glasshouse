import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ChevronRight } from "@/components/icons";
import { currentViewer } from "@/lib/auth";
import { SHED_NAME, SITE_NAME } from "@/lib/brand";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The Shed's own door: pick a project, straight in when there is only one. */
export default async function ShedHome() {
  const store = getStore();
  const viewer = await currentViewer();
  if (!viewer) redirect("/signin?next=/shed");
  const projects = await store.listProjects(viewer.id);
  if (projects.length === 1) redirect(`/shed/${projects[0]!.id}`);
  if (projects.length === 0) redirect("/connect");
  const counts = await Promise.all(projects.map((p) => store.listHelpers(p.id).then((h) => h.length).catch(() => 0)));

  return (
    <main className="page">
      <PageHeader back="/" backLabel={SITE_NAME} title={SHED_NAME} right={<span className="live-state">{store.mode === "local" ? "on this computer" : viewer.plan === "pro" ? "Pro" : "Free"}</span>} />
      <div className="page-intro">
        <h1>Which project?</h1>
        <p>Helpers belong to a project, because they are grown from what has happened in it.</p>
      </div>
      <ul className="projects">
        {projects.map((p, i) => (
          <li key={p.id}>
            <a className="project-card" href={`/shed/${p.id}`}>
              <span className="project-main">
                <span className="project-name">{p.name}</span>
                <span className="project-root">{counts[i] === 0 ? "No helpers yet" : `${counts[i]} helper${counts[i] === 1 ? "" : "s"}`}</span>
              </span>
              <ChevronRight />
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
