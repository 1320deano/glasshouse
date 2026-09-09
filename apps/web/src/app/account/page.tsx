import { redirect } from "next/navigation";
import { Account } from "@/components/Account";
import { currentViewer } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing";
import { SITE_NAME } from "@/lib/brand";
import { PRO_PRICE_GBP } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/signin?next=/account");
  const { upgraded } = await searchParams;
  const store = getStore();
  const [profile, projects] = await Promise.all([viewer.local ? null : store.getProfile(viewer.id), store.listProjects(viewer.id)]);
  return <Account productName={SITE_NAME} email={viewer.email} plan={viewer.plan} priceGbp={PRO_PRICE_GBP} billing={billingEnabled()} local={viewer.local} subscriptionStatus={profile?.subscriptionStatus} upgraded={upgraded === "1"} projects={projects.length} />;
}
