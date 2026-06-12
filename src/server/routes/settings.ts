import { Hono } from "hono";
import { requireRole, type AuthVars } from "../auth";
import type { Env } from "../index";

// Single pinned doc shown as the landing page. value = document id as string.
export const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>()
  .get("/pinned", async (c) => {
    const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pinned_doc_id'").first<{ value: string }>();
    return c.json({ doc_id: row ? Number(row.value) : null });
  })
  .put("/pinned", requireRole("admin", "editor"), async (c) => {
    const { doc_id } = await c.req.json<{ doc_id?: number | null }>().catch(() => ({}) as never);
    if (doc_id === null || doc_id === undefined) {
      await c.env.DB.prepare("DELETE FROM settings WHERE key = 'pinned_doc_id'").run();
      return c.json({ doc_id: null });
    }
    const doc = await c.env.DB.prepare("SELECT id FROM documents WHERE id = ?").bind(doc_id).first();
    if (!doc) return c.json({ error: "document not found" }, 404);
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('pinned_doc_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
      .bind(String(doc_id))
      .run();
    return c.json({ doc_id });
  })
  .put("/site-name", requireRole("admin"), async (c) => {
    const { site_name } = await c.req.json<{ site_name?: string }>().catch(() => ({}) as never);
    if (!site_name?.trim()) return c.json({ error: "site_name required" }, 400);
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('site_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
      .bind(site_name.trim())
      .run();
    return c.json({ site_name: site_name.trim() });
  });
