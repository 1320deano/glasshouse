"use client";

import type { TaskView } from "@/lib/store/types";
import { Check } from "./icons";
import { NEEDS_YOU_TEXT, RISK_TEXT } from "./labels";

/**
 * The report card (brief 5.1). The tile turns into this when a task finishes.
 * Every line under "Touched", "Not touched" and "Evidence" is computed from the task's record;
 * only the headline, before/after, reasons and the needs-you question may be written by AI.
 */
export function ReportCard({ task, technical = false, compact = false }: { task: TaskView; technical?: boolean; compact?: boolean }) {
  const r = task.report;
  if (!r) return null;
  const ev = r.evidence;
  const sensitive = [...ev.secretsTouched, ...ev.settingsTouched, ...ev.databaseTouched];
  return (
    <div className={`report${compact ? " compact" : ""}`}>
      {r.beforeAfter && <p className="report-before-after">{r.beforeAfter}</p>}

      <div className="report-cols">
        <section className="report-col">
          <h3 className="section-label">Touched</h3>
          {r.touched.length === 0 ? (
            <p className="muted">No part of the app was changed.</p>
          ) : (
            <ul className="report-list">
              {r.touched.map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong> <span className="faint">· {t.reason}</span>
                  {technical && <div className="mono faint tiny">{t.files.join(", ")}</div>}
                </li>
              ))}
            </ul>
          )}
          {r.outsideAnyPart.length > 0 && (
            <p className="faint small">
              {r.outsideAnyPart.length} changed file{r.outsideAnyPart.length === 1 ? " is" : "s are"} outside any known part of the app.
              {technical && <span className="mono"> {r.outsideAnyPart.join(", ")}</span>}
            </p>
          )}
          {r.notTouched.length > 0 && (
            <p className="verified" title="Checked against the list of files this task changed">
              <Check />
              <span>
                <span className="verified-label">Not touched:</span> {r.notTouched.join(" · ")}
              </span>
            </p>
          )}
        </section>

        <section className="report-col">
          <h3 className="section-label">Evidence</h3>
          <ul className="report-list">
            <li>
              {ev.tests.ran
                ? ev.tests.failed
                  ? `Checks: ${ev.tests.passed ?? 0} passed, ${ev.tests.failed} failed`
                  : `Checks: all ${ev.tests.passed ?? 0} passed${ev.tests.runs > 1 ? ` (run ${ev.tests.runs} times)` : ""}`
                : "Checks: none were run"}
            </li>
            <li>{ev.newDependencies.length > 0 ? `New tools added: ${ev.newDependencies.join(", ")}` : ev.installs > 0 ? `New tools added: ${ev.installs}` : "New tools added: none"}</li>
            <li>
              Settings or secrets touched: {sensitive.length > 0 ? "yes" : "no"}
              {sensitive.length > 0 && (
                <span className="faint">
                  {" "}
                  ({ev.secretsTouched.length > 0 ? `${ev.secretsTouched.length} secrets file${ev.secretsTouched.length === 1 ? "" : "s"}` : ""}
                  {ev.settingsTouched.length > 0 ? `${ev.secretsTouched.length > 0 ? ", " : ""}${ev.settingsTouched.length} settings file${ev.settingsTouched.length === 1 ? "" : "s"}` : ""}
                  {ev.databaseTouched.length > 0 ? `${ev.secretsTouched.length + ev.settingsTouched.length > 0 ? ", " : ""}database layout` : ""})
                </span>
              )}
              {technical && sensitive.length > 0 && <div className="mono faint tiny">{sensitive.join(", ")}</div>}
            </li>
            <li>
              {ev.filesChanged} file{ev.filesChanged === 1 ? "" : "s"} changed
              {ev.filesCreated > 0 ? `, ${ev.filesCreated} new` : ""}
              {ev.commits > 0 ? ` · ${ev.commits} checkpoint${ev.commits === 1 ? "" : "s"} saved` : ""}
              {ev.errors > 0 ? ` · ${ev.errors} error${ev.errors === 1 ? "" : "s"} along the way` : ""}
            </li>
          </ul>
          <p className="risk-line" data-level={r.risk.level}>
            {RISK_TEXT[r.risk.level]}: {r.riskReason ?? r.risk.reasons.join("; ")}
          </p>
        </section>
      </div>

      <p className="needs-you" data-need={r.needsYou}>
        <strong>{NEEDS_YOU_TEXT[r.needsYou]}</strong>
        {r.needsYouDetail ? <> — {r.needsYouDetail}</> : null}
        {r.resolvedAt ? <span className="faint"> — cleared</span> : null}
      </p>
      {!compact && <p className="report-source">{r.source === "ai" ? "Words written by AI; facts computed from the record." : "Written from the record without AI."}</p>}
    </div>
  );
}
