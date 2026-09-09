import { notFound } from "next/navigation";
import { Admin } from "@/components/Admin";
import { currentViewer } from "@/lib/auth";
import { SITE_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const viewer = await currentViewer();
  if (!viewer?.admin) notFound();
  return <Admin productName={SITE_NAME} inviteOnly={process.env.GLASSHOUSE_INVITE_ONLY === "1"} />;
}
