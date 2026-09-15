import { z } from "zod";
import { canReadProject } from "@/lib/auth";
import { answerGlasshouse } from "@/lib/requests/glasshouse";
import { requestMoved } from "@/lib/requests/server";
import { getStore } from "@/lib/store";
import type { RequestRecord } from "@/lib/store/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  projectId: z.string().min(1),
  tool: z.enum(["claude-code", "codex", "cursor", "glasshouse"]),
  text: z.string().trim().min(1).max(4000),
  /** A follow-up to an agent already in the Room: the Room's session id. */
  continues: z.object({ sessionId: z.string().min(1) }).optional(),
  origin: z.object({ kind: z.enum(["typed", "suggested"]), suggestionId: z.string().max(200).optional(), taskId: z.string().max(200).optional() }).optional(),
  care: z.enum(["ask", "free"]).optional(),
  /** For a question to Glasshouse: the task it is about, if one. */
  focusTaskId: z.string().max(200).optional(),
});

/**
 * The owner asked for something in the Room's chat (Phase 8). A question to Glasshouse is
 * answered here and now, from the record. An instruction for a tool is stored as queued and the
 * owner's own connector takes it from there: nothing here runs anything.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say who it is for and what you want, in up to 4000 characters." }, { status: 400 });
  const body = parsed.data;
  const viewer = await canReadProject(req, body.projectId);
  if (!viewer) return Response.json({ error: "not allowed" }, { status: 401 });
  const store = getStore();
  const now = new Date().toISOString();
  const ownerId = viewer.id === "setup" ? null : viewer.id;

  if (body.tool === "glasshouse") {
    const answer = await answerGlasshouse({ projectId: body.projectId, question: body.text, focusTaskId: body.focusTaskId, plan: viewer.plan, now });
    if (!answer) return Response.json({ error: "no such project" }, { status: 404 });
    const record = await store.createRequest({ projectId: body.projectId, ownerId, tool: "glasshouse", text: body.text, origin: body.origin ?? { kind: "typed" }, care: "ask", status: "answered", answer, createdAt: now });
    requestMoved(body.projectId);
    return Response.json({ request: record });
  }

  let continues: RequestRecord["continues"];
  let externalSessionId: string | undefined;
  if (body.continues) {
    const room = await store.getRoom(body.projectId);
    const session = room?.sessions.find((s) => s.id === body.continues!.sessionId);
    if (!session) return Response.json({ error: "That agent is no longer in the Room." }, { status: 404 });
    if (session.tool !== body.tool) return Response.json({ error: `That agent is ${session.tool}, not ${body.tool}.` }, { status: 400 });
    continues = { sessionId: session.id, externalId: session.externalId };
    externalSessionId = session.externalId;
  } else if (body.tool === "claude-code") {
    // Claude Code takes the session id it should use, so the card is linked from its first action.
    externalSessionId = crypto.randomUUID();
  }
  const record = await store.createRequest({
    projectId: body.projectId,
    ownerId,
    tool: body.tool,
    text: body.text,
    continues,
    origin: body.origin ?? { kind: "typed" },
    care: body.care ?? "ask",
    status: "queued",
    externalSessionId,
    createdAt: now,
  });
  requestMoved(body.projectId);
  return Response.json({ request: record });
}
