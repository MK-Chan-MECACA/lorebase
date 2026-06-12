import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import DocView from "./pages/DocView";
import DocEdit from "./pages/DocEdit";
import Admin from "./pages/Admin";
import Categories from "./pages/Categories";
import { useParams } from "react-router-dom";
import { useData } from "./data";

// Resolves /doc/s/:slug → /doc/:id (imported cross-doc links use slugs; ids vary per import)
function SlugRedirect() {
  const { slug } = useParams();
  const { docs } = useData();
  if (!docs.length) return <div className="page-loading">Loading…</div>;
  const doc = docs.find((d) => d.slug === slug);
  return <Navigate to={doc ? `/doc/${doc.id}` : "/"} replace />;
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function AdminOnly() {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <Admin />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route path="/" element={<Home />} />
            <Route path="/doc/:id" element={<DocView />} />
            <Route path="/doc/s/:slug" element={<SlugRedirect />} />
            <Route path="/new" element={<DocEdit />} />
            <Route path="/edit/:id" element={<DocEdit />} />
            <Route path="/admin" element={<AdminOnly />} />
            <Route path="/categories" element={<Categories />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
