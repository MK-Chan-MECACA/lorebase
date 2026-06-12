import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth";
import { DataProvider } from "../data";
import Sidebar from "./Sidebar";
import AiPanel from "./AiPanel";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, siteName } = useAuth();
  const navigate = useNavigate();

  return (
    <DataProvider>
      <div className="app-shell">
        <header className="topbar">
          <Link to="/" className="brand">
            {siteName || "Documentation"}
          </Link>
          <div className="topbar-right">
            <span className="user-name">{user?.name}</span>
            <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
            {user?.role === "admin" && <Link to="/admin">Admin</Link>}
            <button
              className="link-btn"
              onClick={() => {
                logout().then(() => navigate("/login"));
              }}
            >
              Log out
            </button>
          </div>
        </header>
        <div className="body-wrap">
          <Sidebar />
          <main className="content">{children}</main>
        </div>
        <AiPanel />
      </div>
    </DataProvider>
  );
}
