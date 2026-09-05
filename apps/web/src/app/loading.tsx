/** The skeleton of a Room while the first render is on its way. Same shape, no content. */
export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <span className="visually-hidden">Loading</span>
      <div className="page-head">
        <div className="skeleton" style={{ width: 180, height: 16 }} />
        <div className="skeleton" style={{ width: 240, height: 16 }} />
      </div>
      <div className="tiles">
        {[0, 1].map((i) => (
          <div className="tile" key={i}>
            <div className="tile-head">
              <div className="skeleton" style={{ width: 140, height: 12 }} />
              <div className="skeleton" style={{ width: 80, height: 12 }} />
            </div>
            <div className="skeleton" style={{ width: "88%", height: 30, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: "46%", height: 14 }} />
            <div className="skeleton" style={{ width: 190, height: 26, borderRadius: 999 }} />
            <div className="tile-foot">
              <div className="skeleton" style={{ width: "60%", height: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
