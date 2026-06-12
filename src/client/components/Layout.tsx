import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { DataProvider } from "../data";
import Sidebar from "./Sidebar";
import AiPanel from "./AiPanel";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, siteName } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // close the mobile drawer whenever the route changes
  useEffect(() => {
    setNavOpen(false);
  }, [location]);

  return (
    <DataProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-btn" aria-label="Toggle navigation" onClick={() => setNavOpen((o) => !o)}>
              ☰
            </button>
            <Link to="/" className="brand">
              {siteName || "Documentation"}
            </Link>
          </div>
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
          <Sidebar open={navOpen} />
          {navOpen && <div className="backdrop" onClick={() => setNavOpen(false)} />}
          <main className="content">{children}</main>
          <AiPanel />
        </div>
      </div>
    </DataProvider>
  );
}
