import type { ReactNode } from "react";

/**
 * Around every page. Unlike a layout, a template is remounted on each navigation, so the entrance
 * in styles/base.css (`.enter`) plays every time a screen arrives, and never again while it is open.
 * A plain block: nothing about a page's own layout depends on being a direct child of the body.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="enter">{children}</div>;
}
