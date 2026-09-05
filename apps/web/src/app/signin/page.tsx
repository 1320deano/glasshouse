import { redirect } from "next/navigation";
import { SignIn } from "@/components/SignIn";
import { currentViewer } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; preview?: string }> }) {
  const { next, error, preview } = await searchParams;
  // Local mode always has a viewer, so this page would never render there. `?preview=1` lets the
  // hosted sign-in screen be looked at (and screenshotted) while designing. Development only.
  const previewing = process.env.NODE_ENV !== "production" && preview === "1";
  if (!previewing && (await currentViewer())) redirect(next && next.startsWith("/") ? next : "/");
  return <SignIn productName={PRODUCT_NAME} next={next ?? "/"} error={error} inviteOnly={process.env.GLASSHOUSE_INVITE_ONLY === "1"} />;
}
