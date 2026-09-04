import { UPGRADE_REASONS, type GatedFeature } from "@/lib/plan";

/** What the free tier sees where a Pro feature would be. One checkable reason, one link. */
export function UpgradePanel({ feature, productName, back }: { feature: GatedFeature; productName: string; back: string }) {
  return (
    <main className="room narrow">
      <div className="room-header">
        <div>
          <a href={back}>← Back to the Room</a>
        </div>
      </div>
      <div className="empty">
        <h2>{UPGRADE_REASONS[feature]}</h2>
        <p>
          <a className="button primary" href="/account">
            See plans
          </a>
        </p>
        <p className="muted small">{productName} Free keeps the live Room and report cards. Pro adds the memory.</p>
      </div>
    </main>
  );
}
