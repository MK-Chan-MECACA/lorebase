import { Hono } from "hono";
import { hashPassword } from "../crypto";
import type { Env } from "../index";

async function userCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getSiteName(db: D1Database): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'site_name'").first<{ value: string }>();
  return row?.value ?? "Lorebase";
}

// Public endpoints: site metadata + one-time first-admin creation.
export const setupRoutes = new Hono<{ Bindings: Env }>()
  .get("/meta", async (c) => {
    return c.json({
      site_name: await getSiteName(c.env.DB),
      needs_setup: (await userCount(c.env.DB)) === 0,
    });
  })
  .post("/setup", async (c) => {
    // Only allowed while no users exist — closed forever after the first admin.
    if ((await userCount(c.env.DB)) > 0) return c.json({ error: "setup already completed" }, 403);
    const body = await c.req
      .json<{ email?: string; name?: string; password?: string; site_name?: string }>()
      .catch(() => ({}) as never);
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.name?.trim() || !body.password) {
      return c.json({ error: "email, name, password required" }, 400);
    }
    if (body.password.length < 8) return c.json({ error: "password must be at least 8 characters" }, 400);
    await c.env.DB.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .bind(email, body.name.trim(), await hashPassword(body.password))
      .run();
    if (body.site_name?.trim()) {
      await c.env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('site_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
        .bind(body.site_name.trim())
        .run();
    }
    return c.json({ ok: true }, 201);
  });
