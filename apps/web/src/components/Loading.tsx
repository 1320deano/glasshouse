/**
 * One quiet wheel while something is on its way.
 *
 * Not a skeleton. A skeleton is a guess at the shape of what is coming, and here the shape is not
 * knowable up front: the Room is three columns whose folds and widths live in the browser, the Shed
 * and the front door are different shapes again, and the same loading state covers all of them. A
 * guessed shape is a reassurance with nothing behind it (rule 2), and the moment it swaps for the
 * real page everything jumps. The wheel promises nothing about layout; the real screen then arrives
 * in one movement (`.enter` in styles/base.css).
 *
 * It waits a beat before showing (`.loading` in styles/components.css), so a fast answer never
 * flashes it. `page` centres it in the viewport for a whole page that is still on its way.
 */
export function Loading({ label = "Loading", page = false }: { label?: string; page?: boolean }) {
  return (
    <div className={page ? "loading page-loading" : "loading"} role="status" aria-live="polite" aria-busy="true">
      <span className="spinner large" aria-hidden="true" />
      <span className="loading-label">{label}</span>
    </div>
  );
}
