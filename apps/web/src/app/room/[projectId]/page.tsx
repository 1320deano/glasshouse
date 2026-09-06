import { notFound, redirect } from "next/navigation";
import { Room } from "@/components/Room";
import { currentViewer } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";
import { roomForViewer } from "@/lib/room";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { projectId } = await params;
  const { welcome } = await searchParams;
  const store = getStore();
  const viewer = await currentViewer();
  if (!viewer) redirect(`/signin?next=/room/${projectId}`);
  const project = await store.getProject(projectId);
  if (!project) notFound();
  if (!viewer.local && !viewer.admin && project.ownerId !== viewer.id) notFound();
  const initial = await roomForViewer(projectId, viewer);
  if (!initial) notFound();
  // The header's project switcher: the viewer's own projects (every project in local mode).
  const mine = await store.listProjects(viewer.local ? undefined : viewer.id);
  const projects = (mine.some((p) => p.id === projectId) ? mine : [project, ...mine]).map((p) => ({ id: p.id, name: p.name }));
  return <Room initial={initial} mode={store.mode} productName={PRODUCT_NAME} welcome={welcome === "1"} viewer={{ email: viewer.email, admin: viewer.admin, local: viewer.local }} projects={projects} />;
}
