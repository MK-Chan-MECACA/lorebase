import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import DOMPurify from "dompurify";
import { api, type Doc } from "../api";
import { useAuth, canEdit } from "../auth";
import { useData } from "../data";

function DocBody({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "width", "height", "type", "placeholder"],
  });
  return <div className="doc-body" dangerouslySetInnerHTML={{ __html: clean }} />;
}

export default function DocView() {
  const { id } = useParams();
  const { user } = useAuth();
  const { reload } = useData();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  useEffect(() => {
    setDoc(null);
    setError("");
    api<Doc>(`/api/documents/${id}`)
      .then(setDoc)
      .catch((e) => setError(e.message));
    api<{ doc_id: number | null }>("/api/settings/pinned")
      .then((r) => setPinnedId(r.doc_id))
      .catch(() => {});
  }, [id]);

  const isPinned = doc !== null && pinnedId === doc.id;
  const togglePin = async () => {
    if (!doc) return;
    const r = await api<{ doc_id: number | null }>("/api/settings/pinned", {
      method: "PUT",
      body: JSON.stringify({ doc_id: isPinned ? null : doc.id }),
    });
    setPinnedId(r.doc_id);
  };

  const remove = async () => {
    if (!doc) return;
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await api(`/api/documents/${doc.id}`, { method: "DELETE" });
    await reload();
    navigate("/");
  };

  if (error) return <div className="error">{error}</div>;
  if (!doc) return <div className="page-loading">Loading…</div>;

  return (
    <article className="doc-page">
      <div className="doc-header">
        <h1>{doc.title}</h1>
        {canEdit(user) && (
          <div className="doc-actions">
            <button className="btn btn-secondary" onClick={togglePin} title="Pinned doc opens right after login">
              {isPinned ? "📌 Unpin" : "📌 Pin to home"}
            </button>
            <Link to={`/edit/${doc.id}`} className="btn">
              Edit
            </Link>
            <button className="btn btn-danger" onClick={remove}>
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="doc-meta">
        Last updated {doc.updated_at}
        {doc.updated_by && doc.updated_by !== "import" ? ` by ${doc.updated_by}` : ""}
      </div>
      <DocBody html={doc.content_html} />
    </article>
  );
}
