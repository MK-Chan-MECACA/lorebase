import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import type { AuthVars, SessionUser } from "../auth";
import type { Env } from "../index";
import { slugify } from "./documents";

const MAX_ITERATIONS = 15;
const MAX_HISTORY = 30;

type SseEvent =
  | { t: "text"; v: string }
  | { t: "tool"; name: string; detail: string; link?: string }
  | { t: "done" }
  | { t: "error"; v: string };

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function buildTools(canWrite: boolean): Anthropic.Tool[] {
  const readTools: Anthropic.Tool[] = [
    {
      name: "search_docs",
      description:
        "Search the documentation by keyword. Call this whenever the user asks how to do something, about a feature, or anything that might be covered by the docs — always search before answering doc questions. Returns matching docs with id, slug, title, category and a snippet.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", description: "Keywords to search for" } },
        required: ["query"],
      },
    },
    {
      name: "read_doc",
      description:
        "Read the full content of one document by id or slug. Call after search_docs to get the details needed to answer accurately.",
      input_schema: {
        type: "object",
        properties: { id_or_slug: { type: "string", description: "Document id (number) or slug" } },
        required: ["id_or_slug"],
      },
    },
    {
      name: "list_categories",
      description: "List all documentation categories with their ids, names and document counts.",
      input_schema: { type: "object", properties: {} },
    },
  ];
  if (!canWrite) return readTools;
  return [
    ...readTools,
    {
      name: "create_category",
      description: "Create a new documentation category. Call when the user asks to add a category/section.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          emoji: { type: "string", description: "Optional single emoji icon" },
        },
        required: ["name"],
      },
    },
    {
      name: "create_doc",
      description:
        "Create a new document. content_html is an HTML fragment (headings, p, ul/ol, tables, img, a). Call when the user asks to write/add/clone a doc. Search first to avoid duplicates.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          category_id: { type: "integer", description: "From list_categories; create_category first if none fits" },
          content_html: { type: "string" },
        },
        required: ["title", "category_id", "content_html"],
      },
    },
    {
      name: "update_doc",
      description: "Update an existing document's title, category or content. Read it first with read_doc.",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          category_id: { type: "integer" },
          content_html: { type: "string" },
        },
        required: ["id"],
      },
    },
    {
      name: "fetch_webpage",
      description:
        "Fetch a public web page and return its cleaned HTML body. Call when the user asks to clone/import a page from the internet into the docs; then adapt the content and create_doc.",
      input_schema: {
        type: "object",
        properties: { url: { type: "string", description: "Full http(s) URL" } },
        required: ["url"],
      },
    },
  ];
}

async function runTool(
  env: Env,
  user: SessionUser,
  name: string,
  input: Record<string, unknown>,
  emit: (e: SseEvent) => Promise<void>,
): Promise<string> {
  const db = env.DB;
  switch (name) {
    case "search_docs": {
      const q = String(input.query ?? "").trim();
      await emit({ t: "tool", name, detail: q });
      const like = `%${q.replace(/[%_]/g, " ")}%`;
      const { results } = await db
        .prepare(
          `SELECT d.id, d.slug, d.title, c.name AS category, substr(d.content_html, 1, 400) AS head
           FROM documents d JOIN categories c ON c.id = d.category_id
           WHERE d.title LIKE ?1 OR d.content_html LIKE ?1
           ORDER BY (d.title LIKE ?1) DESC, d.title LIMIT 8`,
        )
        .bind(like)
        .all<{ id: number; slug: string; title: string; category: string; head: string }>();
      if (!results.length) return "No documents matched.";
      return results
        .map((r) => `id=${r.id} slug=${r.slug} [${r.category}] ${r.title}\n  ${stripHtml(r.head).slice(0, 150)}`)
        .join("\n");
    }
    case "read_doc": {
      const key = String(input.id_or_slug ?? "");
      const row = await db
        .prepare("SELECT d.*, c.name AS category FROM documents d JOIN categories c ON c.id = d.category_id WHERE d.id = ?1 OR d.slug = ?2")
        .bind(Number(key) || -1, key)
        .first<{ id: number; slug: string; title: string; category: string; content_html: string }>();
      if (!row) return "Document not found.";
      await emit({ t: "tool", name, detail: row.title, link: `/doc/${row.id}` });
      return `# ${row.title} (id=${row.id}, slug=${row.slug}, category=${row.category})\n\n${stripHtml(row.content_html).slice(0, 20000)}`;
    }
    case "list_categories": {
      await emit({ t: "tool", name, detail: "" });
      const { results } = await db
        .prepare(
          `SELECT c.id, c.emoji, c.name, COUNT(d.id) AS docs FROM categories c
           LEFT JOIN documents d ON d.category_id = c.id GROUP BY c.id ORDER BY c.sort_order`,
        )
        .all<{ id: number; emoji: string; name: string; docs: number }>();
      return results.map((r) => `id=${r.id} ${r.emoji} ${r.name} (${r.docs} docs)`).join("\n");
    }
    case "create_category": {
      const catName = String(input.name ?? "").trim();
      if (!catName) return "Error: name required.";
      const row = await db
        .prepare(
          `INSERT INTO categories (name, emoji, sort_order)
           VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories)) RETURNING id, name`,
        )
        .bind(catName, String(input.emoji ?? "").trim())
        .first<{ id: number; name: string }>();
      await emit({ t: "tool", name, detail: catName });
      return `Created category id=${row!.id} "${row!.name}".`;
    }
    case "create_doc": {
      const title = String(input.title ?? "").trim();
      const categoryId = Number(input.category_id);
      const html = String(input.content_html ?? "");
      if (!title || !categoryId) return "Error: title and category_id required.";
      const cat = await db.prepare("SELECT id FROM categories WHERE id = ?").bind(categoryId).first();
      if (!cat) return `Error: category ${categoryId} does not exist — call list_categories.`;
      let slug = slugify(title) || "doc";
      for (let n = 2; await db.prepare("SELECT 1 FROM documents WHERE slug = ?").bind(slug).first(); n++) {
        slug = `${slugify(title)}-${n}`;
      }
      const row = await db
        .prepare(
          `INSERT INTO documents (category_id, title, slug, content_html, updated_by)
           VALUES (?, ?, ?, ?, ?) RETURNING id`,
        )
        .bind(categoryId, title, slug, html, `${user.email} (AI)`)
        .first<{ id: number }>();
      await emit({ t: "tool", name, detail: title, link: `/doc/${row!.id}` });
      return `Created document id=${row!.id} slug=${slug} "${title}".`;
    }
    case "update_doc": {
      const id = Number(input.id);
      const existing = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<any>();
      if (!existing) return `Error: document ${id} not found.`;
      if (input.category_id !== undefined) {
        const cat = await db.prepare("SELECT id FROM categories WHERE id = ?").bind(Number(input.category_id)).first();
        if (!cat) return `Error: category ${input.category_id} does not exist.`;
      }
      await db
        .prepare(
          `UPDATE documents SET title = ?, category_id = ?, content_html = ?,
           updated_at = datetime('now'), updated_by = ? WHERE id = ?`,
        )
        .bind(
          String(input.title ?? existing.title),
          Number(input.category_id ?? existing.category_id),
          String(input.content_html ?? existing.content_html),
          `${user.email} (AI)`,
          id,
        )
        .run();
      await emit({ t: "tool", name, detail: String(input.title ?? existing.title), link: `/doc/${id}` });
      return `Updated document id=${id}.`;
    }
    case "fetch_webpage": {
      const url = String(input.url ?? "");
      if (!/^https?:\/\//.test(url)) return "Error: full http(s) URL required.";
      await emit({ t: "tool", name, detail: url });
      try {
        const res = await fetch(url, {
          headers: { "user-agent": "Mozilla/5.0 (compatible; Lorebase-AI/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return `Error: fetch returned ${res.status}.`;
        const html = await res.text();
        const body = html
          .replace(/<(script|style|nav|header|footer|svg|noscript)[\s\S]*?<\/\1>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/\son\w+="[^"]*"/gi, "");
        const m = body.match(/<(article|main)[\s\S]*?<\/\1>/i);
        return (m ? m[0] : body).slice(0, 60000);
      } catch (e) {
        return `Error fetching page: ${e instanceof Error ? e.message : "unknown"}`;
      }
    }
    default:
      return `Unknown tool ${name}.`;
  }
}

function systemPrompt(siteName: string, user: SessionUser, canWrite: boolean): string {
  return `You are the AI assistant built into "${siteName}", a documentation site. You help users find and follow the documentation, and${canWrite ? " you can also create and update content for them." : " you answer questions about it."}

Grounding rules:
- For any question about how to do something, ALWAYS call search_docs first (try 1-3 different keyword sets), then read_doc on the best matches before answering.
- Base answers on the documentation. Quote the doc's steps faithfully. When you reference a doc, link it as a markdown link to its path, e.g. [Adding New Coupon](/doc/s/adding-new-coupon).
- If the docs don't cover it, say so clearly, then give your best general guidance, marked as not from the docs.
${canWrite ? `
Content rules (user role: ${user.role}):
- create_doc/update_doc content_html is a clean HTML fragment: <h2>/<h3> headings, <p>, <ul>/<ol>, <table>, <a>, <img src="...">. No <html>/<head>/<body>, no scripts or styles.
- When asked to clone a page from the internet: fetch_webpage, extract the substantive content, rewrite it as clean HTML (keep images as absolute URLs), pick or create a fitting category, then create_doc. Tell the user what you created with a link.
- Confirm destructive-feeling intents (overwriting an existing doc) by reading it first and saying what will change.` : `
The user has read-only access; you cannot create or modify content for them.`}

Keep answers concise and practical. The user is "${user.name}" (${user.role}).`;
}

export const aiRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>().post("/chat", async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "AI is not configured: set the ANTHROPIC_API_KEY secret" }, 503);
  }
  const user = c.get("user");
  const canWrite = user.role === "admin" || user.role === "editor";
  const body = await c.req.json<{ messages?: { role: "user" | "assistant"; content: string }[] }>().catch(() => ({}) as never);
  const history = (body.messages ?? []).slice(-MAX_HISTORY).filter((m) => m.content?.trim());
  if (!history.length || history[history.length - 1].role !== "user") {
    return c.json({ error: "messages must end with a user message" }, 400);
  }

  const siteRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'site_name'").first<{ value: string }>();
  const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });
  const tools = buildTools(canWrite);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: systemPrompt(siteRow?.value ?? "Lorebase", user, canWrite), cache_control: { type: "ephemeral" } },
  ];

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const emit = async (e: SseEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
  };

  const model = c.env.AI_MODEL || "claude-opus-4-8";
  // Adaptive thinking exists on Opus 4.6+/Sonnet 4.6+/Fable; older models (e.g. Haiku 4.5) reject it
  const adaptive = /fable|opus-4-[6-9]|sonnet-4-[6-9]|opus-5|sonnet-5/.test(model);

  const run = async () => {
    let messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const stream = client.messages.stream({
          model,
          max_tokens: 16000,
          ...(adaptive ? { thinking: { type: "adaptive" as const } } : {}),
          system,
          tools,
          messages,
        });
        stream.on("text", (delta) => {
          void emit({ t: "text", v: delta });
        });
        const message = await stream.finalMessage();
        messages.push({ role: "assistant", content: message.content });

        if (message.stop_reason === "pause_turn") continue;
        const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (message.stop_reason !== "tool_use" || !toolUses.length) break;

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          let result: string;
          try {
            result = await runTool(c.env, user, tu.name, tu.input as Record<string, unknown>, emit);
          } catch (e) {
            result = `Tool error: ${e instanceof Error ? e.message : "unknown"}`;
          }
          results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
        }
        messages.push({ role: "user", content: results });
      }
      await emit({ t: "done" });
    } catch (e) {
      await emit({ t: "error", v: e instanceof Error ? e.message : "AI request failed" });
    } finally {
      await writer.close();
    }
  };
  c.executionCtx.waitUntil(run());

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
