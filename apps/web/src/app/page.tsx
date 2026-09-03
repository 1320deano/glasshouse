import { redirect } from "next/navigation";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = getStore();
  const projects = await store.listProjects();
  if (projects.length === 1) redirect(`/room/${projects[0]!.id}`);

  return (
    <main className="room">
      <div className="room-header">
        <strong>Glasshouse</strong>
        <span>{store.mode === "local" ? "Local mode" : "Connected to Supabase"}</span>
      </div>
      {projects.length === 0 ? (
        <div className="empty">
          <h2>No project connected yet.</h2>
          <p>In a terminal, inside the folder of the project you want to watch, run:</p>
          <pre>npx glasshouse connect</pre>
          <p>Then start Claude Code in that folder as usual. This page will turn into the Room.</p>
        </div>
      ) : (
        <>
          <div className="section-title">Projects</div>
          <ul className="projects">
            {projects.map((p) => (
              <li key={p.id}>
                <a href={`/room/${p.id}`}>{p.name}</a>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
