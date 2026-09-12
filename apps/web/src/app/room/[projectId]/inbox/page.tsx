import { notFound, redirect } from "next/navigation";
import { Inbox } from "@/components/Inbox";
import { UpgradePanel } from "@/components/UpgradePanel";
import { currentViewer } from "@/lib/auth";
import { SITE_NAME } from "@/lib/brand";
import { featureAllowed } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The needs-you inbox: Review recommended, Decision needed, Blocked, in one list, cleared by you. Pro only. */
export default async function InboxPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const viewer = await currentViewer();
  if (!viewer) redirect(`/signin?next=/room/${projectId}/inbox`);
  const project = await getStore().getProject(projectId);
  if (!project || (!viewer.local && !viewer.admin && project.ownerId !== viewer.id)) notFound();
  if (!featureAllowed(viewer.plan, "inbox")) return <UpgradePanel feature="inbox" productName={SITE_NAME} back={`/room/${projectId}`} />;
  return <Inbox project={project} />;
}
