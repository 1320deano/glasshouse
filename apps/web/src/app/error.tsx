"use client";

import { useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Alert } from "@/components/icons";
import { SITE_NAME } from "@/lib/brand";

/**
 * Something in the Room itself broke. Watch-only means never losing the owner's place: say what
 * happened in plain words, offer one button, and keep the technical detail behind a toggle.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page narrow">
      <PageHeader brand={SITE_NAME} title="Something went wrong" />
      <div className="empty">
        <Alert size={22} className="empty-icon" />
        <h2>This page could not be drawn.</h2>
        <p>Nothing your agents did was affected — {SITE_NAME} only ever watches. Try again, and if it keeps happening use “Something’s wrong” at the bottom of the Room.</p>
        <div className="toolbar">
          <button className="button primary" onClick={reset}>
            Try again
          </button>
          <a className="button subtle" href="/">
            Back to {SITE_NAME}
          </a>
        </div>
        {error.digest && <p className="faint tiny mono">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
