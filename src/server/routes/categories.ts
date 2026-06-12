import { Hono } from "hono";
import { requireRole, type AuthVars } from "../auth";
import type { Env } from "../index";

const editor = requireRole("admin", "editor");

export const categoryRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>()
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT c.id, c.name, c.emoji, c.sort_order, COUNT(d.id) AS doc_count
       FROM categories c LEFT JOIN documents d ON d.category_id = c.id
       GROUP BY c.id ORDER BY c.sort_order, c.name`,
    ).all();
    return c.json(results);
  })
  .post("/", editor, async (c) => {
    const { name, emoji } = await c.req.json<{ name?: string; emoji?: string }>().catch(() => ({}) as never);
    if (!name?.trim()) return c.json({ error: "name required" }, 400);
    const row = await c.env.DB.prepare(
      `INSERT INTO categories (name, emoji, sort_order)
       VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))
       RETURNING *`,
    )
      .bind(name.trim(), emoji?.trim() ?? "")
      .first();
    return c.json(row, 201);
  })
  .patch("/:id", editor, async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<{ name?: string; emoji?: string; sort_order?: number }>().catch(() => ({}) as never);
    const existing = await c.env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(id).first();
    if (!existing) return c.json({ error: "not found" }, 404);
    if (body.name !== undefined && !body.name.trim()) return c.json({ error: "name cannot be empty" }, 400);
    const row = await c.env.DB.prepare(
      "UPDATE categories SET name = ?, emoji = ?, sort_order = ? WHERE id = ? RETURNING *",
    )
      .bind(
        body.name?.trim() ?? existing.name,
        body.emoji?.trim() ?? existing.emoji,
        body.sort_order ?? existing.sort_order,
        id,
      )
      .first();
    return c.json(row);
  })
  .delete("/:id", editor, async (c) => {
    const id = Number(c.req.param("id"));
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM documents WHERE category_id = ?")
      .bind(id)
      .first<{ n: number }>();
    if (count && count.n > 0) return c.json({ error: "category has documents" }, 409);
    const res = await c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    if (!res.meta.changes) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });
