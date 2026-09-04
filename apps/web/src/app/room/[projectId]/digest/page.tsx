import { notFound } from "next/navigation";
import { DigestView } from "@/components/DigestView";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The digest (brief 5.2): since you last checked, today, this week. In-app; email is Phase 5. */
export default async function DigestPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getStore().getProject(projectId);
  if (!project) notFound();
  return <DigestView project={project} />;
}
