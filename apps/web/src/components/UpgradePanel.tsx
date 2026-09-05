import { UPGRADE_REASONS, type GatedFeature } from "@/lib/plan";
import { Layers } from "./icons";
import { PageHeader } from "./PageHeader";

/** What the free tier sees where a Pro feature would be. One checkable reason, one link. */
export function UpgradePanel({ feature, productName, back }: { feature: GatedFeature; productName: string; back: string }) {
  return (
    <main className="page narrow">
      <PageHeader back={back} />
      <div className="empty">
        <Layers size={22} className="empty-icon" />
        <h2>{UPGRADE_REASONS[feature]}</h2>
        <p>{productName} Free keeps the live Room and report cards. Pro adds the memory: the digest, the needs-you inbox, and questions about any task.</p>
        <a className="button primary" href="/account">
          See plans
        </a>
      </div>
    </main>
  );
}
