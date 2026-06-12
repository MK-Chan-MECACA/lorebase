import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";

export default function Login() {
  const { login, siteName, needsSetup, refreshMeta } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (needsSetup) {
        await api("/api/setup", {
          method: "POST",
          body: JSON.stringify({ email, name, password, site_name: newSiteName }),
        });
        await refreshMeta();
      }
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>{needsSetup ? "Welcome to Lorebase" : siteName || "Documentation"}</h1>
        <p className="login-sub">
          {needsSetup ? "Set up your site by creating the first admin account." : "Sign in to continue"}
        </p>
        {needsSetup && (
          <>
            <label>
              Site name
              <input
                placeholder="e.g. Acme Documentation"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          </>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!needsSetup} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={needsSetup ? 8 : undefined}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Working…" : needsSetup ? "Create admin & sign in" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
