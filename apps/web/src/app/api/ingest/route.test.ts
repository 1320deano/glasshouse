import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { subscribe } from "@/lib/bus";
import { POST } from "./route";

describe("POST /api/ingest", () => {
  it("rejects unknown tokens, accepts a batch, and notifies the Room", async () => {
    globalThis.__glasshouseStore = new MemoryStore();
    const { project, token } = await globalThis.__glasshouseStore.createProject({ name: "t" });
    const notices: unknown[] = [];
    const stop = subscribe((n) => notices.push(n));

    const event = {
      id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a5b",
      projectId: "99999999-9999-4999-8999-999999999999", // wrong on purpose: the token decides
      sessionId: "s1",
      taskKey: "p1",
      tool: "claude-code",
      kind: "prompt",
      ts: "2026-09-03T21:00:00.000Z",
      paths: [],
      prompt: "fix the login bug",
      summary: "fix the login bug",
      sourceEvent: "UserPromptSubmit",
      raw: {},
    };
    const body = JSON.stringify({ connectorVersion: "0.1.0", events: [event] });

    const bad = await POST(new Request("http://x/api/ingest", { method: "POST", headers: { authorization: "Bearer nope" }, body }));
    expect(bad.status).toBe(401);

    const ok = await POST(new Request("http://x/api/ingest", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body }));
    expect(await ok.json()).toEqual({ inserted: 1, duplicates: 0 });
    expect(await POST(new Request("http://x/api/ingest", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body })).then((r) => r.json())).toEqual({ inserted: 0, duplicates: 1 });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ projectId: project.id, inserted: 1 });

    const room = await globalThis.__glasshouseStore.getRoom(project.id);
    expect(room?.sessions[0]?.task?.headline).toBe("Looking into your request");
    expect(room?.sessions[0]?.task?.prompt).toBe("fix the login bug");
    stop();
    globalThis.__glasshouseStore = undefined;
  });
});
