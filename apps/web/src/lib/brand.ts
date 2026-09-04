/**
 * The product name lives in one place. "Glasshouse" is the working codename (docs/name-check.md);
 * the launch name is a Phase 4 decision, and changing it is one environment variable.
 */
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || "Glasshouse";
export const TAGLINE = "See what your AI coding agents are doing, in plain English.";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
/** The npm command people run. Kept as the codename until the package is published under the final name. */
export const CONNECT_COMMAND = process.env.NEXT_PUBLIC_CONNECT_COMMAND?.trim() || "npx glasshouse connect";
