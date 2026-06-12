import { Hono } from "hono";
import { requireRole, type AuthVars } from "../auth";
import type { Env } from "../index";

const editor = requireRole("admin", "editor");

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(db: D1Database, title: string, excludeId?: number): Promise<string> {
  const base = slugify(title) || "doc";
  let slug = base;
  for (let n = 2; ; n++) {
    const clash = await db
      .prepare("SELECT id FROM documents WHERE slug = ? AND id != ?")
      .bind(slug, excludeId ?? -1)
      .first();
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
}

async function validate(c: any, body: { title?: string; category_id?: number }) {
  if (body.title !== undefined) {
    if (!body.title.trim()) return "title required";
    if (body.title.length > 200) return "title too long (max 200)";
  }
  if (body.category_id !== undefined) {
    const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ?").bind(body.category_id).first();
    if (!cat) return "category does not exist";
  }
  return null;
}

export const documentRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>()
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, category_id, title, slug, updated_at FROM documents ORDER BY title",
    ).all();
    return c.json(results);
  })
  .get("/:id", async (c) => {
    const row = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?").bind(Number(c.req.param("id"))).first();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .post("/", editor, async (c) => {
    const body = await c.req
      .json<{ title?: string; category_id?: number; content_html?: string }>()
      .catch(() => ({}) as never);
    if (!body.title?.trim() || body.category_id === undefined) {
      return c.json({ error: "title and category_id required" }, 400);
    }
    const err = await validate(c, body);
    if (err) return c.json({ error: err }, err === "category does not exist" ? 404 : 400);
    const slug = await uniqueSlug(c.env.DB, body.title);
    const row = await c.env.DB.prepare(
      `INSERT INTO documents (category_id, title, slug, content_html, updated_by)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(body.category_id, body.title.trim(), slug, body.content_html ?? "", c.get("user").email)
      .first();
    return c.json(row, 201);
  })
  .patch("/:id", editor, async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req
      .json<{ title?: string; category_id?: number; content_html?: string }>()
      .catch(() => ({}) as never);
    const existing = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<any>();
    if (!existing) return c.json({ error: "not found" }, 404);
    const err = await validate(c, body);
    if (err) return c.json({ error: err }, err === "category does not exist" ? 404 : 400);
    const title = body.title?.trim() ?? existing.title;
    const slug = body.title !== undefined ? await uniqueSlug(c.env.DB, title, id) : existing.slug;
    const row = await c.env.DB.prepare(
      `UPDATE documents SET title = ?, slug = ?, category_id = ?, content_html = ?,
       updated_at = datetime('now'), updated_by = ? WHERE id = ? RETURNING *`,
    )
      .bind(
        title,
        slug,
        body.category_id ?? existing.category_id,
        body.content_html ?? existing.content_html,
        c.get("user").email,
        id,
      )
      .first();
    return c.json(row);
  })
  .delete("/:id", editor, async (c) => {
    const res = await c.env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(Number(c.req.param("id"))).run();
    if (!res.meta.changes) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });
