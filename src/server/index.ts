import { Hono } from "hono";
import { authRoutes, requireAuth, type AuthVars } from "./auth";
import { categoryRoutes } from "./routes/categories";
import { documentRoutes } from "./routes/documents";
import { imageUploadRoutes, imageServeRoutes } from "./routes/images";
import { userRoutes } from "./routes/users";
import { settingsRoutes } from "./routes/settings";
import { setupRoutes } from "./routes/setup";
import { aiRoutes } from "./routes/ai";

export type Env = {
  DB: D1Database;
  IMAGES: R2Bucket;
  AI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env; Variables: AuthVars }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.route("/api", setupRoutes); // public: GET /api/meta, POST /api/setup (first run only)

// Everything else under /api requires a session
app.use("/api/*", requireAuth);
app.route("/api/categories", categoryRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/images", imageUploadRoutes);
app.route("/api/users", userRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/ai", aiRoutes);

// R2-backed image serving (own auth check; lives outside /api)
app.route("/images", imageServeRoutes);

export default app;
