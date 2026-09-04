import { redirect } from "next/navigation";
import { SignIn } from "@/components/SignIn";
import { currentViewer } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await currentViewer()) redirect(next && next.startsWith("/") ? next : "/");
  return <SignIn productName={PRODUCT_NAME} next={next ?? "/"} error={error} inviteOnly={process.env.GLASSHOUSE_INVITE_ONLY === "1"} />;
}
