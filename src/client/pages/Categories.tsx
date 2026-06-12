import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useData } from "../data";

export default function Categories() {
  const { categories, reload } = useData();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    run(() => api("/api/categories", { method: "POST", body: JSON.stringify({ name, emoji }) })).then(() => {
      setName("");
      setEmoji("");
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const a = categories[idx];
    const b = categories[idx + dir];
    if (!a || !b) return;
    run(async () => {
      await api(`/api/categories/${a.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: b.sort_order }) });
      await api(`/api/categories/${b.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: a.sort_order }) });
    });
  };

  const rename = (id: number, current: string) => {
    const next = prompt("Category name", current);
    if (next && next.trim() && next !== current) {
      run(() => api(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify({ name: next.trim() }) }));
    }
  };

  const setIcon = (id: number, current: string) => {
    const next = prompt("Emoji (leave empty for none)", current);
    if (next !== null) {
      run(() => api(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify({ emoji: next.trim() }) }));
    }
  };

  return (
    <div className="admin-page">
      <h1>Categories</h1>
      {error && <div className="error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Docs</th>
            <th>Order</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c, i) => (
            <tr key={c.id}>
              <td>
                <button className="link-btn" title="Change emoji" onClick={() => setIcon(c.id, c.emoji)}>
                  {c.emoji || "—"}
                </button>
              </td>
              <td>{c.name}</td>
              <td>{c.doc_count}</td>
              <td>
                <button className="link-btn" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>{" "}
                <button className="link-btn" disabled={i === categories.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
              </td>
              <td>
                <button className="btn btn-secondary btn-sm" onClick={() => rename(c.id, c.name)}>
                  Rename
                </button>{" "}
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (confirm(`Delete category "${c.name}"?`))
                      run(() => api(`/api/categories/${c.id}`, { method: "DELETE" }));
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add category</h2>
      <form className="add-user" onSubmit={add}>
        <input placeholder="Emoji (optional)" value={emoji} onChange={(e) => setEmoji(e.target.value)} size={4} />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}
