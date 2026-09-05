import { PageHeader } from "@/components/PageHeader";
import { Search } from "@/components/icons";
import { PRODUCT_NAME } from "@/lib/brand";

/** Nothing here. Said in owner language, with the two doors out. */
export default function NotFound() {
  return (
    <main className="page narrow">
      <PageHeader brand={PRODUCT_NAME} title="Not found" />
      <div className="empty">
        <Search size={22} className="empty-icon" />
        <h2>There is nothing at this address.</h2>
        <p>The project may have been removed, or the link may belong to a different account.</p>
        <a className="button primary" href="/">
          Back to your projects
        </a>
      </div>
    </main>
  );
}
