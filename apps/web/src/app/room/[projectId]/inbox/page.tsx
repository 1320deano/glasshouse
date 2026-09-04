import { notFound } from "next/navigation";
import { Inbox } from "@/components/Inbox";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The needs-you inbox: Review recommended, Decision needed, Blocked, in one list, cleared by you. */
export default async function InboxPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getStore().getProject(projectId);
  if (!project) notFound();
  return <Inbox project={project} />;
}
