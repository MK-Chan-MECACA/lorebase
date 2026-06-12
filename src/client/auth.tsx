import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "./api";

type Meta = { site_name: string; needs_setup: boolean };

type AuthState = {
  user: User | null;
  loading: boolean;
  siteName: string;
  needsSetup: boolean;
  refreshMeta: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<Meta>({ site_name: "", needs_setup: false });

  const refreshMeta = useCallback(async () => {
    try {
      const m = await api<Meta>("/api/meta");
      setMeta(m);
      document.title = m.site_name;
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    refreshMeta();
    api<User>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [refreshMeta]);

  const login = async (email: string, password: string) => {
    setUser(await api<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, siteName: meta.site_name, needsSetup: meta.needs_setup, refreshMeta, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export const canEdit = (user: User | null) => user?.role === "admin" || user?.role === "editor";
