import { Hono, type Context, type Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { verifyPassword } from "./crypto";
import type { Env } from "./index";

export type SessionUser = { id: number; email: string; name: string; role: "admin" | "editor" | "viewer" };
export type AuthVars = { user: SessionUser };

const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

function newToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

async function userForToken(db: D1Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .bind(token)
    .first<SessionUser & { expires_at: string }>();
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export const authRoutes = new Hono<{ Bindings: Env }>()
  .post("/login", async (c) => {
    const { email, password } = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as never);
    if (!email || !password) return c.json({ error: "email and password required" }, 400);
    const user = await c.env.DB.prepare(
      "SELECT id, email, name, role, password_hash FROM users WHERE email = ?",
    )
      .bind(email.trim().toLowerCase())
      .first<SessionUser & { password_hash: string }>();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: "invalid email or password" }, 401);
    }
    const token = newToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await c.env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(token, user.id, expires.toISOString())
      .run();
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      expires,
    });
    return c.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  })
  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  })
  .get("/me", async (c) => {
    const user = await userForToken(c.env.DB, getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "not authenticated" }, 401);
    return c.json(user);
  });

export async function requireAuth(c: Context<{ Bindings: Env; Variables: AuthVars }>, next: Next) {
  const user = await userForToken(c.env.DB, getCookie(c, SESSION_COOKIE));
  if (!user) return c.json({ error: "not authenticated" }, 401);
  c.set("user", user);
  await next();
}

export function requireRole(...roles: SessionUser["role"][]) {
  return async (c: Context<{ Bindings: Env; Variables: AuthVars }>, next: Next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}
