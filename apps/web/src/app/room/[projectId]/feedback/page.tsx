import { notFound, redirect } from "next/navigation";
import { FeedbackReview } from "@/components/FeedbackReview";
import { currentViewer } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Disliked plain-English lines with the real action behind each, for the weekly review. */
export default async function FeedbackPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const viewer = await currentViewer();
  if (!viewer) redirect(`/signin?next=/room/${projectId}/feedback`);
  const project = await getStore().getProject(projectId);
  if (!project || (!viewer.local && !viewer.admin && project.ownerId !== viewer.id)) notFound();
  return <FeedbackReview project={project} />;
}
