/** A random id kept in the browser so visitors are counted once, never identified. */
export function visitorId(): string {
  try {
    const key = "glasshouse.visitor";
    let id = localStorage.getItem(key);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "anon";
  }
}
