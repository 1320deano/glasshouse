import type { ReactNode } from "react";
import type { Product } from "@/lib/brand";
import { ChevronRight, Grid, Mark, Screen, Sprout } from "./icons";

/**
 * The front door after sign-in: Deano's two products, side by side, in the Room's own chrome.
 * Each card carries one line of live fact computed from the record (rule 2), never a slogan:
 * how many agents are working right now, how many helpers have been grown.
 */
export interface ProductFact {
  id: Product["id"];
  /** The live line under the blurb. */
  fact: string;
  /** Lit only when the owner is the blocker: "2 waiting for you". */
  attention?: string;
}

const ICONS: Record<Product["id"], (p: { size?: number; className?: string }) => ReactNode> = {
  glasshouse: (p) => <Screen {...p} />,
  shed: (p) => <Sprout {...p} />,
};

function greeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function ProductPicker({
  siteName,
  products,
  facts,
  viewer,
  projects,
  hour,
  planLabel,
}: {
  siteName: string;
  products: Product[];
  facts: ProductFact[];
  viewer: { email?: string; admin: boolean; local: boolean };
  projects: number;
  /** The server's hour, so the greeting on first paint matches the HTML exactly. */
  hour: number;
  planLabel: string;
}) {
  return (
    <>
      <a className="skip-link" href="#products">
        Skip to the products
      </a>
      <main className="room picker">
        <header className="room-head">
          <div className="room-head-left">
            <a className="brand" href="/" aria-current="page">
              <Mark />
              <span>{siteName}</span>
            </a>
          </div>
          <nav className="room-nav" aria-label="Your account">
            <a className="nav-link" href="/connect">
              {projects === 0 ? "Connect a project" : "Projects"}
              {projects > 0 && <span className="nav-count">{projects}</span>}
            </a>
            {!viewer.local && (
              <a className="nav-link" href="/account">
                {viewer.email ?? "Account"}
              </a>
            )}
            {viewer.admin && !viewer.local && (
              <a className="nav-link" href="/admin">
                Testers
              </a>
            )}
            <span className="live-state">{planLabel}</span>
          </nav>
        </header>

        <div className="picker-body" id="products">
          <div className="picker-head">
            <p className="picker-eyebrow">
              <Grid size={14} /> Two products, one story of your project
            </p>
            <h1 className="story-title">{greeting(hour)}. Where would you like to go?</h1>
            <p className="story-sub">
              {projects === 0
                ? "Neither product has anything to show until a project is connected. Either card will take you there."
                : `${projects} project${projects === 1 ? "" : "s"} connected. Both products read from the same record, so nothing is lost when you move between them.`}
            </p>
          </div>

          <ul className="products">
            {products.map((p) => {
              const fact = facts.find((f) => f.id === p.id);
              return (
                <li key={p.id}>
                  <a className="product-card" href={p.href} data-product={p.id}>
                    <span className="product-icon" aria-hidden="true">
                      {ICONS[p.id]({ size: 22 })}
                    </span>
                    <span className="product-main">
                      <span className="product-name">{p.name}</span>
                      <span className="product-tag">{p.tagline}</span>
                      <span className="product-blurb">{p.blurb}</span>
                      {fact && (
                        <span className="product-fact">
                          <span className="dot" data-on={fact.attention ? "yes" : "no"} aria-hidden="true" />
                          {fact.fact}
                          {fact.attention && (
                            <span className="pill sm" data-tone="attention">
                              {fact.attention}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="product-open">
                      Open <ChevronRight size={14} />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </>
  );
}
