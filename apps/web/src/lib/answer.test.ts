import { describe, expect, it } from "vitest";
import { askServer, readAnswer } from "./answer";

const FALLBACK = "Could not sign in.";
const page = (status: number) =>
  new Response('<!DOCTYPE html><html><body><h2>There is nothing at this address.</h2></body></html>', { status, headers: { "content-type": "text/html" } });

/**
 * The bug this guards: pressing "Get started" showed the owner the browser's own words,
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, whenever anything other than the
 * route answered. Nothing readAnswer returns may ever contain a word like that.
 */
const JARGON = /unexpected token|not valid JSON|JSON|SyntaxError|<!DOCTYPE|undefined|\bnull\b/i;

describe("readAnswer", () => {
  it("hands back the answer when the server sent one", async () => {
    const { data, problem, status } = await readAnswer<{ ok: boolean; next: string }>(Response.json({ ok: true, next: "/room" }), FALLBACK);
    expect(problem).toBeNull();
    expect(data).toEqual({ ok: true, next: "/room" });
    expect(status).toBe(200);
  });

  it("prefers the route's own plain-English line over anything of its own", async () => {
    const res = Response.json({ error: "That email already has an account. Sign in instead." }, { status: 409 });
    const { problem } = await readAnswer(res, FALLBACK);
    expect(problem).toBe("That email already has an account. Sign in instead.");
  });

  it("turns a whole web page into words about the situation, never about the parsing", async () => {
    const { data, problem } = await readAnswer(page(404), FALLBACK);
    expect(data).toBeNull();
    expect(problem).toContain("older version");
    expect(problem).not.toMatch(JARGON);
  });

  it("says something plain for every status a route can fail with", async () => {
    for (const status of [400, 401, 403, 404, 413, 429, 500, 502, 503, 504]) {
      const { problem } = await readAnswer(page(status), FALLBACK);
      expect(problem, `status ${status}`).toBeTruthy();
      expect(problem, `status ${status}`).not.toMatch(JARGON);
    }
  });

  it("covers the empty body a route that stopped halfway leaves behind", async () => {
    // Next.js answers an uncaught error in a route with a 500 and no body at all.
    const { problem } = await readAnswer(new Response("", { status: 500 }), FALLBACK);
    expect(problem).toContain(FALLBACK);
    expect(problem).not.toMatch(JARGON);
    // An empty body that succeeded is not a problem.
    expect((await readAnswer(new Response(null, { status: 204 }), FALLBACK)).problem).toBeNull();
  });

  it("does not mistake a page answered with 200 for an answer", async () => {
    const { data, problem } = await readAnswer(page(200), FALLBACK);
    expect(data).toBeNull();
    expect(problem).toContain("page instead of an answer");
    expect(problem).not.toMatch(JARGON);
  });

  it("ignores an error field that is not words", async () => {
    const { problem } = await readAnswer(Response.json({ error: { code: 500 } }, { status: 500 }), FALLBACK);
    expect(problem).toContain(FALLBACK);
    expect(problem).not.toMatch(JARGON);
  });
});

describe("askServer", () => {
  it("says the Room is not answering when the request never left the browser", async () => {
    const { data, problem, status } = await askServer(() => Promise.reject(new TypeError("Failed to fetch")), FALLBACK);
    expect(data).toBeNull();
    expect(status).toBe(0);
    expect(problem).toContain("did not answer at all");
    expect(problem).not.toMatch(JARGON);
  });

  it("reads a good answer through unchanged", async () => {
    const { data } = await askServer<{ next: string }>(() => Promise.resolve(Response.json({ next: "/shed" })), FALLBACK);
    expect(data).toEqual({ next: "/shed" });
  });
});
