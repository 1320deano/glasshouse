/**
 * Names live in one place.
 *
 * Deano is the website. Inside it are two products:
 *   Glasshouse    the watch-only control room (the Room, reports, digest, inbox)
 *   Potting Shed  where the owner raises helpers (agents and sub-agents) for their project
 *
 * "Glasshouse" and "Potting Shed" are working names (docs/name-check.md, docs/phase-6-findings.md);
 * changing any of them is one environment variable.
 */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Deano";
export const SITE_TAGLINE = "Watch your AI coding agents, and raise better ones.";

/** The Room's product. Kept under its old export name because the whole app already reads it. */
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || "Glasshouse";
export const TAGLINE = "See what your AI coding agents are doing, in plain English.";

/** The agent builder's product. */
export const SHED_NAME = process.env.NEXT_PUBLIC_SHED_NAME?.trim() || "Potting Shed";
export const SHED_TAGLINE = "Raise helpers for your project, grown from what your agents actually did.";

export type ProductId = "glasshouse" | "shed";

export interface Product {
  id: ProductId;
  name: string;
  tagline: string;
  /** Where the product opens. Each product picks the project itself. */
  href: string;
  /** One plain sentence for the picker card. */
  blurb: string;
}

export const PRODUCTS: Product[] = [
  {
    id: "glasshouse",
    name: PRODUCT_NAME,
    tagline: TAGLINE,
    href: "/glasshouse",
    blurb: "Watch every agent working in your project, in plain English, as it happens. Nothing here can touch an agent; it only shows you the truth.",
  },
  {
    id: "shed",
    name: SHED_NAME,
    tagline: SHED_TAGLINE,
    href: "/shed",
    blurb: "Build helpers for your agents without writing a line. Each one is grown from what has actually happened in your project, and checked afterwards.",
  },
];

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
/** The npm command people run. Kept as the codename until the package is published under the final name. */
export const CONNECT_COMMAND = process.env.NEXT_PUBLIC_CONNECT_COMMAND?.trim() || "npx glasshouse connect";
/** The command that puts the helpers grown in the Shed into the project folder. */
export const HELPERS_COMMAND = process.env.NEXT_PUBLIC_HELPERS_COMMAND?.trim() || "npx glasshouse helpers";
