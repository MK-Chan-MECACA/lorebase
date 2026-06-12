import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useData } from "../data";

export default function Home() {
  const { siteName } = useAuth();
  const { categories, docs } = useData();
  const [pinned, setPinned] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    api<{ doc_id: number | null }>("/api/settings/pinned")
      .then((r) => setPinned(r.doc_id))
      .catch(() => setPinned(null));
  }, []);

  if (pinned === undefined || (pinned !== null && docs.length === 0)) {
    return <div className="page-loading">Loading…</div>;
  }
  if (pinned !== null && docs.some((d) => d.id === pinned)) return <Navigate to={`/doc/${pinned}`} replace />;

  return (
    <div className="home">
      <h1>Welcome to {siteName || "the documentation"}</h1>
      <p>
        {docs.length} documents across {categories.filter((c) => c.doc_count > 0).length} categories. Pick a document
        from the sidebar to get started.
      </p>
    </div>
  );
}
