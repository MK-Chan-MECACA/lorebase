import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { api, type Doc } from "../api";
import { useData } from "../data";
import Editor from "../components/Editor";

export default function DocEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { categories, reload } = useData();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api<Doc>(`/api/documents/${id}`)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        setCategoryId(d.category_id);
      })
      .catch((e) => setError(e.message));
  }, [id, isNew]);

  const save = async () => {
    if (!editor) return;
    if (!title.trim()) return setError("Title is required");
    if (categoryId === "") return setError("Pick a category");
    setError("");
    setBusy(true);
    try {
      const body = JSON.stringify({ title, category_id: categoryId, content_html: editor.getHTML() });
      const saved = isNew
        ? await api<Doc>("/api/documents", { method: "POST", body })
        : await api<Doc>(`/api/documents/${id}`, { method: "PATCH", body });
      await reload();
      navigate(`/doc/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!isNew && !doc && !error) return <div className="page-loading">Loading…</div>;

  return (
    <div className="edit-page">
      <div className="edit-head">
        <input
          className="title-input"
          placeholder="Document title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
          <option value="" disabled>
            Category…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji ? `${c.emoji} ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-secondary" onClick={() => navigate(isNew ? "/" : `/doc/${id}`)}>
          Cancel
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <Editor initialHtml={doc?.content_html ?? "<p></p>"} onReady={setEditor} />
    </div>
  );
}
