import { redirect } from "next/navigation";
import { Connect } from "@/components/Connect";
import { currentViewer } from "@/lib/auth";
import { CONNECT_COMMAND, SITE_NAME, SITE_URL } from "@/lib/brand";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/signin?next=/connect");
  const projects = await getStore().listProjects(viewer.id);
  return <Connect productName={SITE_NAME} connectCommand={CONNECT_COMMAND} server={SITE_URL} local={viewer.local} plan={viewer.plan} projectCount={projects.length} />;
}
