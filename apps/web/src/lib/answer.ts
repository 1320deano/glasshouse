/**
 * Reading an answer from our own server without ever showing the owner a programmer's error.
 *
 * `fetch` hands back whatever arrived. When something other than the route answers — the
 * "nothing at this address" page after the Room was updated but not restarted, a hosting
 * service's own error page, a proxy in the way — the body is a web page, not an answer, and
 * `res.json()` throws the browser's own words: `Unexpected token '<', "<!DOCTYPE "... is not
 * valid JSON`. Those words used to be shown to the owner verbatim, which breaks rule 5: every
 * word in the UI is for someone who will never open the code.
 *
 * So nothing in the browser calls `res.json()` directly. It calls `readAnswer`, which either
 * hands back the server's answer or hands back one plain-English line saying what happened and
 * what to do about it. The status number is kept on the line so a problem can still be reported
 * accurately without anyone having to open the developer tools.
 */

export interface Answer<T> {
  /** The server's own answer, when it sent one that could be read. Null when it did not. */
  data: T | null;
  /** One plain-English line to show the owner, or null when the answer came back fine. */
  problem: string | null;
  /** The HTTP status, so a report can name the real number. 0 when the server was not reached. */
  status: number;
}

/**
 * What to say when the server sent something other than an answer. `fallback` is the calling
 * screen's own sentence for "this did not work", so the line always starts in that screen's terms.
 */
function unreadable(status: number, fallback: string): string {
  if (status === 404)
    return "The part of the Room that handles this did not answer. That usually means the Room is still running an older version of itself: close it, start it again, and try once more.";
  if (status === 401 || status === 403) return "You are not signed in any more. Reload the page and sign in again.";
  if (status === 413) return "That was too much to send at once.";
  if (status === 429) return "That was tried too many times in a row. Wait a minute and try again.";
  if (status === 502 || status === 503 || status === 504)
    return "The Room could not be reached just now. It may still be starting up, or it may have stopped. Wait a moment and try again.";
  if (status >= 500) return `${fallback} The Room ran into a problem it could not put into words (error ${status}).`;
  return `${fallback} (Error ${status}.)`;
}

/**
 * Read one answer. Never throws: a failure always comes back as `problem`, ready to show.
 *
 * `fallback` is the one sentence for "this did not work" in the calling screen's own words, used
 * when the server did not say anything more useful itself.
 */
export async function readAnswer<T>(res: Response, fallback: string): Promise<Answer<T>> {
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  let isJson = false;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  if (!isJson) {
    // Nothing at all, from a route that stopped halfway; or a whole web page, from something
    // answering in front of it. Either way the owner hears about the situation, not the parsing.
    if (res.ok && !text.trim()) return { data: null, problem: null, status: res.status };
    if (res.ok) return { data: null, problem: `${fallback} The Room sent back a page instead of an answer, which usually means it is still starting up or has been updated without being restarted.`, status: res.status };
    return { data: null, problem: unreadable(res.status, fallback), status: res.status };
  }

  const data = parsed as T & { error?: unknown };
  if (!res.ok) {
    // The route's own plain-English line is always preferred; it knows what actually happened.
    const said = typeof data?.error === "string" && data.error.trim() ? data.error : null;
    return { data, problem: said ?? unreadable(res.status, fallback), status: res.status };
  }
  return { data, problem: null, status: res.status };
}

/**
 * The same read for a request that may not have left the browser at all (no network, the Room
 * stopped). `run` is the fetch. A thrown fetch becomes a plain line too, never a stack trace.
 */
export async function askServer<T>(run: () => Promise<Response>, fallback: string): Promise<Answer<T>> {
  let res: Response;
  try {
    res = await run();
  } catch {
    return { data: null, problem: "The Room did not answer at all. Check it is still running, then try again.", status: 0 };
  }
  return readAnswer<T>(res, fallback);
}
