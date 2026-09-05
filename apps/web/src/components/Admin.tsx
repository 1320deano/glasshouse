"use client";

import { useCallback, useEffect, useState } from "react";
import type { Invite, MetricCounts, Profile, TesterNote } from "@/lib/store/types";
import { Alert } from "./icons";
import { ago } from "./labels";
import { PageHeader } from "./PageHeader";

interface Person extends Profile {
  projects: number;
  sessions: number;
  tasks: number;
  lastEventAt?: string;
  aiCostGbp: number;
}

interface AdminData {
  metrics: MetricCounts;
  people: Person[];
  invites: Invite[];
  notes: TesterNote[];
  summary: { testers: number; activeLast5Days: number; pro: number; aiCostPerProGbp: number; unownedProjects: number };
}

/** The tester dashboard (Phase 4 exit test): who is still using it on day five, what broke, what it costs. */
export function Admin({ productName, inviteOnly }: { productName: string; inviteOnly: boolean }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin?days=30", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      setData((await res.json()) as AdminData);
    } catch {
      setError("Could not load.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>) {
    await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await load();
  }

  return (
    <main className="page">
      <PageHeader brand={productName} title="Testers" right={<span className="badge sm plain">private</span>} />
      {error && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">{error}</div>
        </div>
      )}
      {!data && !error && (
        <span className="loading-row">
          <span className="spinner" />
          Loading
        </span>
      )}
      {data && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-value">{data.metrics.byEvent.landing_view}</div>
              <div className="stat-label">visitors, 30 days</div>
            </div>
            <div className="stat">
              <div className="stat-value">{data.metrics.byEvent.signup_completed}</div>
              <div className="stat-label">signed up</div>
            </div>
            <div className="stat">
              <div className="stat-value">{data.metrics.signupRatePct === null ? "–" : `${data.metrics.signupRatePct}%`}</div>
              <div className="stat-label">sign-up rate (target 5%)</div>
            </div>
            <div className="stat">
              <div className="stat-value">
                {data.summary.activeLast5Days}/{data.summary.testers}
              </div>
              <div className="stat-label">active in the last 5 days (target 7 of 10)</div>
            </div>
            <div className="stat">
              <div className="stat-value">{data.summary.pro}</div>
              <div className="stat-label">on Pro</div>
            </div>
            <div className="stat">
              <div className="stat-value">£{data.summary.aiCostPerProGbp}</div>
              <div className="stat-label">AI cost per Pro person (alert above £5)</div>
            </div>
          </div>

          <section className="admin-section">
            <h2 className="section-label">People</h2>
            {data.people.length === 0 ? (
              <p className="muted">Nobody has signed in yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Plan</th>
                      <th>Projects</th>
                      <th>Sessions</th>
                      <th>Tasks</th>
                      <th>Last agent activity</th>
                      <th>Last opened</th>
                      <th>AI cost</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map((p) => (
                      <tr key={p.userId}>
                        <td>{p.email ?? p.userId}</td>
                        <td>{p.plan}</td>
                        <td className="num">{p.projects}</td>
                        <td className="num">{p.sessions}</td>
                        <td className="num">{p.tasks}</td>
                        <td>{p.lastEventAt ? ago(p.lastEventAt, now) : "never"}</td>
                        <td>{p.lastSeenAt ? ago(p.lastSeenAt, now) : "never"}</td>
                        <td className="num">£{p.aiCostGbp}</td>
                        <td>
                          <button className="link-button small" onClick={() => void act({ action: "set_plan", userId: p.userId, plan: p.plan === "pro" ? "free" : "pro" })}>
                            {p.plan === "pro" ? "Set free" : "Set Pro"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.summary.unownedProjects > 0 && <p className="faint small">{data.summary.unownedProjects} project(s) were connected before sign-in existed and belong to nobody.</p>}
          </section>

          <section className="admin-section">
            <h2 className="section-label">Invites {inviteOnly ? "(invite-only is on)" : "(invite-only is off: anyone can sign up)"}</h2>
            <form
              className="field-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (email) void act({ action: "invite", email }).then(() => setEmail(""));
              }}
            >
              <label className="visually-hidden" htmlFor="invite-email">
                Email to invite
              </label>
              <input id="invite-email" className="field" type="email" placeholder="tester@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="button" type="submit">
                Invite
              </button>
            </form>
            <ul className="invite-list">
              {data.invites.map((i) => (
                <li key={i.email}>
                  <span>{i.email}</span>
                  <span className="faint small">{i.acceptedAt ? `signed in ${ago(i.acceptedAt, now)}` : "not yet signed in"}</span>
                  <button className="link-button small" onClick={() => void act({ action: "uninvite", email: i.email })}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-section">
            <h2 className="section-label">What broke ({data.notes.length})</h2>
            {data.notes.length === 0 ? (
              <p className="muted">No notes yet. Testers use “Something’s wrong” at the bottom of the Room.</p>
            ) : (
              <ul className="feedback-list">
                {data.notes.map((n) => (
                  <li key={n.id}>
                    <div className="feedback-plain">{n.note}</div>
                    <div className="faint small">
                      {n.email ?? "someone"} · {n.page} · {ago(n.createdAt, now)}
                    </div>
                    {n.userAgent && <div className="mono faint tiny">{n.userAgent}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
