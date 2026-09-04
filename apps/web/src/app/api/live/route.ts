import { canReadProject } from "@/lib/auth";
import { subscribe } from "@/lib/bus";

export const dynamic = "force-dynamic";

/** Server-sent events: one message per ingest batch for the project. The Room refetches on each. */
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId || !(await canReadProject(req, projectId))) return new Response("not allowed", { status: 401 });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;
      const write = (s: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          open = false;
        }
      };
      write(`data: ${JSON.stringify({ type: "hello", projectId })}\n\n`);
      const unsubscribe = subscribe((n) => {
        if (projectId && n.projectId !== projectId) return;
        write(`data: ${JSON.stringify({ type: "update", ...n })}\n\n`);
      });
      const ping = setInterval(() => write(": ping\n\n"), 15000);
      req.signal.addEventListener("abort", () => {
        open = false;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
