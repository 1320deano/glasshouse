import { notFound, redirect } from "next/navigation";
import { Shed } from "@/components/Shed";
import { currentViewer } from "@/lib/auth";
import { HELPERS_COMMAND, SHED_NAME, SITE_NAME } from "@/lib/brand";
import { shedForViewer } from "@/lib/shed/view";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ShedPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ grow?: string; task?: string }> }) {
  const { projectId } = await params;
  const { grow, task } = await searchParams;
  const store = getStore();
  const viewer = await currentViewer();
  if (!viewer) redirect(`/signin?next=/shed/${projectId}`);
  const project = await store.getProject(projectId);
  if (!project) notFound();
  if (!viewer.local && !viewer.admin && project.ownerId !== viewer.id) notFound();
  const initial = await shedForViewer(projectId, viewer);
  if (!initial) notFound();
  const mine = await store.listProjects(viewer.local ? undefined : viewer.id);
  const projects = (mine.some((p) => p.id === projectId) ? mine : [project, ...mine]).map((p) => ({ id: p.id, name: p.name }));
  return <Shed initial={initial} mode={store.mode} shedName={SHED_NAME} siteName={SITE_NAME} helpersCommand={HELPERS_COMMAND} viewer={{ email: viewer.email, admin: viewer.admin, local: viewer.local }} projects={projects} startWith={grow} fromTask={task} />;
}
