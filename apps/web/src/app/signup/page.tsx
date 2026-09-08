import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/AuthScreen";
import { currentViewer } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string; preview?: string }> }) {
  const { next, preview } = await searchParams;
  const previewing = process.env.NODE_ENV !== "production" && preview === "1";
  if (!previewing && (await currentViewer())) redirect(next && next.startsWith("/") ? next : "/");
  return <AuthScreen mode="signup" productName={PRODUCT_NAME} next={next ?? "/"} inviteOnly={process.env.GLASSHOUSE_INVITE_ONLY === "1"} />;
}
