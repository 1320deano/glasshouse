import type { ReactNode } from "react";
import { ArrowLeft } from "./icons";

/**
 * One header for every page that is not the Room: a way back on the left, where the page is on
 * the right. Every sub-page used to roll its own; now the crumb, the sizes and the spacing come
 * from one place.
 */
export function PageHeader({ back, backLabel = "Back to the Room", brand, title, right }: { back?: string; backLabel?: string; brand?: string; title?: string; right?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-left">
        {back ? (
          <a className="back-link" href={back}>
            <ArrowLeft />
            {backLabel}
          </a>
        ) : null}
        {brand && !back ? (
          <a className="brand" href="/">
            {brand}
          </a>
        ) : null}
        {title ? (
          <>
            {(back || brand) && <span className="crumb-sep" aria-hidden="true">/</span>}
            <span className="page-title">{title}</span>
          </>
        ) : null}
      </div>
      {right ? <div className="page-head-right toolbar">{right}</div> : null}
    </header>
  );
}
