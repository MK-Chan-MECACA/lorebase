import { Hono } from "hono";
import { requireRole, type AuthVars } from "../auth";
import { hashPassword } from "../crypto";
import type { Env } from "../index";

const ROLES = ["admin", "editor", "viewer"];

export const userRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>()
  .use("*", requireRole("admin"))
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare("SELECT id, email, name, role FROM users ORDER BY email").all();
    return c.json(results);
  })
  .post("/", async (c) => {
    const body = await c.req
      .json<{ email?: string; name?: string; password?: string; role?: string }>()
      .catch(() => ({}) as never);
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.name?.trim() || !body.password || !body.role) {
      return c.json({ error: "email, name, password, role required" }, 400);
    }
    if (!ROLES.includes(body.role)) return c.json({ error: "invalid role" }, 400);
    if (body.password.length < 8) return c.json({ error: "password must be at least 8 characters" }, 400);
    const dup = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (dup) return c.json({ error: "email already exists" }, 409);
    const row = await c.env.DB.prepare(
      "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id, email, name, role",
    )
      .bind(email, body.name.trim(), await hashPassword(body.password), body.role)
      .first();
    return c.json(row, 201);
  })
  .patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req
      .json<{ name?: string; password?: string; role?: string }>()
      .catch(() => ({}) as never);
    const existing = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
    if (!existing) return c.json({ error: "not found" }, 404);
    if (body.role !== undefined && !ROLES.includes(body.role)) return c.json({ error: "invalid role" }, 400);
    if (body.role && body.role !== "admin" && id === c.get("user").id) {
      return c.json({ error: "cannot demote yourself" }, 400);
    }
    if (body.password !== undefined && body.password.length < 8) {
      return c.json({ error: "password must be at least 8 characters" }, 400);
    }
    const hash = body.password ? await hashPassword(body.password) : existing.password_hash;
    const row = await c.env.DB.prepare(
      "UPDATE users SET name = ?, role = ?, password_hash = ? WHERE id = ? RETURNING id, email, name, role",
    )
      .bind(body.name?.trim() ?? existing.name, body.role ?? existing.role, hash, id)
      .first();
    return c.json(row);
  })
  .delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (id === c.get("user").id) return c.json({ error: "cannot delete yourself" }, 400);
    const res = await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    if (!res.meta.changes) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });
