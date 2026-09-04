import { notFound, redirect } from "next/navigation";
import { DigestView } from "@/components/DigestView";
import { UpgradePanel } from "@/components/UpgradePanel";
import { currentViewer } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";
import { featureAllowed } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The digest (brief 5.2): since you last checked, today, this week. In-app; email is Phase 5. Pro only. */
export default async function DigestPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const viewer = await currentViewer();
  if (!viewer) redirect(`/signin?next=/room/${projectId}/digest`);
  const project = await getStore().getProject(projectId);
  if (!project || (!viewer.local && !viewer.admin && project.ownerId !== viewer.id)) notFound();
  if (!featureAllowed(viewer.plan, "digest")) return <UpgradePanel feature="digest" productName={PRODUCT_NAME} back={`/room/${projectId}`} />;
  return <DigestView project={project} />;
}
