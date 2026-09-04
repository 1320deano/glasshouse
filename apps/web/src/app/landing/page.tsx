import { Landing } from "@/components/Landing";
import { CONNECT_COMMAND, PRODUCT_NAME } from "@/lib/brand";
import { demoFrames } from "@/lib/demo";
import { PRO_PRICE_GBP } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The landing page, always reachable here (in local mode it is a preview; in hosted mode `/` shows it to signed-out visitors). */
export default async function LandingPage() {
  const frames = await demoFrames();
  return <Landing frames={frames} productName={PRODUCT_NAME} priceGbp={PRO_PRICE_GBP} local={getStore().mode === "local"} connectCommand={CONNECT_COMMAND} />;
}
