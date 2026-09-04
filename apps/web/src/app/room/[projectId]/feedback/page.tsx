import { notFound } from "next/navigation";
import { FeedbackReview } from "@/components/FeedbackReview";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Disliked plain-English lines with the real action behind each, for the weekly review. */
export default async function FeedbackPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getStore().getProject(projectId);
  if (!project) notFound();
  return <FeedbackReview project={project} />;
}
