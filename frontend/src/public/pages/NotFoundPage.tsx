import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export function NotFoundPage() {
  usePageMeta({ title: "Not found", pageClass: "site--account" });

  return (
    <section className="kick-account" aria-labelledby="not-found-title">
      <div className="container kick-account__inner">
        <h1 className="title" id="not-found-title">
          Page <span className="accent">not found</span>
        </h1>
        <p className="lead">The page you are looking for does not exist or has moved.</p>
        <div className="kick-account__actions">
          <Link className="kick-account__connect" to="/">
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
