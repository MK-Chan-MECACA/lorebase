import { Hono } from "hono";
import { requireAuth, requireRole, type AuthVars } from "../auth";
import type { Env } from "../index";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// POST /api/images — mounted behind requireAuth in index.ts
export const imageUploadRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>().post(
  "/",
  requireRole("admin", "editor"),
  async (c) => {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return c.json({ error: "file field required" }, 400);
    const ext = TYPES[file.type];
    if (!ext) return c.json({ error: "only png, jpeg, gif, webp allowed" }, 400);
    if (file.size > MAX_BYTES) return c.json({ error: "file too large (max 10 MB)" }, 400);
    const key = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return c.json({ url: `/images/${key}` }, 201);
  },
);

// GET /images/:key — session required, mounted at /images
export const imageServeRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>().get(
  "/:key",
  requireAuth,
  async (c) => {
    const key = c.req.param("key");
    if (!key) return c.json({ error: "not found" }, 404);
    const obj = await c.env.IMAGES.get(key);
    if (!obj) return c.json({ error: "not found" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    });
  },
);
