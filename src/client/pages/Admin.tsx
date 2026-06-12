import { useEffect, useState, type FormEvent } from "react";
import { api, type User } from "../api";
import { useAuth } from "../auth";

const ROLES = ["admin", "editor", "viewer"] as const;

export default function Admin() {
  const { user: me, siteName, refreshMeta } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "editor" });
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const load = () => api<User[]>("/api/users").then(setUsers).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  };

  const addUser = (e: FormEvent) => {
    e.preventDefault();
    run(() => api("/api/users", { method: "POST", body: JSON.stringify(form) })).then(() =>
      setForm({ email: "", name: "", password: "", role: "editor" }),
    );
  };

  const saveSiteName = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/settings/site-name", {
        method: "PUT",
        body: JSON.stringify({ site_name: nameDraft }),
      });
      await refreshMeta();
      setNameDraft(null);
    });
  };

  return (
    <div className="admin-page">
      <h1>Site Settings</h1>
      {error && <div className="error">{error}</div>}
      <form className="add-user" onSubmit={saveSiteName}>
        <input
          value={nameDraft ?? siteName}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Site name"
          required
        />
        <button className="btn" type="submit" disabled={nameDraft === null || nameDraft === siteName}>
          Save
        </button>
      </form>

      <h1>User Management</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.name}</td>
              <td>
                <select
                  value={u.role}
                  disabled={u.id === me?.id}
                  onChange={(e) =>
                    run(() => api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ role: e.target.value }) }))
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {u.id !== me?.id && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm(`Remove ${u.email}?`)) run(() => api(`/api/users/${u.id}`, { method: "DELETE" }));
                    }}
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add user</h2>
      <form className="add-user" onSubmit={addUser}>
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="Temp password (min 8)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          minLength={8}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add
        </button>
      </form>
      <p className="hint">Share the temp password with the person directly; they can keep using it or you can reset it later.</p>
    </div>
  );
}
