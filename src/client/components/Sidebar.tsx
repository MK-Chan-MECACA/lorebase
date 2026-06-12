import { useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth, canEdit } from "../auth";
import { useData } from "../data";

export default function Sidebar() {
  const { user } = useAuth();
  const { categories, docs } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const q = query.trim().toLowerCase();
  const visibleDocs = q ? docs.filter((d) => d.title.toLowerCase().includes(q)) : docs;

  const toggle = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-tools">
        <input
          type="search"
          placeholder="Search docs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canEdit(user) && (
          <div className="sidebar-actions">
            <button onClick={() => navigate("/new")}>+ New Doc</button>
            <Link to="/categories" className="gear" title="Manage categories">
              ⚙
            </Link>
          </div>
        )}
      </div>
      <nav>
        {categories.map((cat) => {
          const catDocs = visibleDocs.filter((d) => d.category_id === cat.id);
          if (q && catDocs.length === 0) return null;
          const isCollapsed = !q && collapsed.has(cat.id);
          return (
            <div key={cat.id} className="cat-group">
              <button className="cat-header" onClick={() => toggle(cat.id)}>
                <span className="cat-caret">{isCollapsed ? "▸" : "▾"}</span>
                <span className="cat-emoji">{cat.emoji}</span>
                <span className="cat-name">{cat.name}</span>
                <span className="cat-count">{cat.doc_count}</span>
              </button>
              {!isCollapsed &&
                catDocs.map((d) => (
                  <NavLink key={d.id} to={`/doc/${d.id}`} className="doc-link">
                    {d.title}
                  </NavLink>
                ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
