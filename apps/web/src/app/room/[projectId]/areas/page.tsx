import { notFound } from "next/navigation";
import { AreasEditor } from "@/components/AreasEditor";
import { aiEnabled } from "@/lib/ai/client";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Settings: the parts of your app. Rename, merge, refresh. Corrections persist and win over refreshes. */
export default async function AreasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const store = getStore();
  const project = await store.getProject(projectId);
  if (!project) notFound();
  const [map, tree] = await Promise.all([store.getAreaMap(projectId), store.getTree(projectId)]);
  return <AreasEditor project={project} initial={map} files={tree?.paths.length ?? 0} scannedAt={tree?.scannedAt} aiEnabled={aiEnabled()} />;
}
