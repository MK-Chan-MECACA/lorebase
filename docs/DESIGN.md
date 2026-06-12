# Lorebase — Design

Self-hosted documentation site with an AI assistant, running entirely on
Cloudflare (Workers + D1 + R2 + Claude API). Extracted and generalized from a
client project (2026-06); approved scope:

- Open-source packaging: configurable branding, first-run setup, importers as
  optional scripts, MIT license, README quickstart, CI.
- AI assistant powered by Anthropic Claude (`claude-opus-4-8` default,
  configurable via `AI_MODEL` var; key via `ANTHROPIC_API_KEY` Worker secret):
  - Doc-grounded Q&A: agentic loop with `search_docs` / `read_doc` /
    `list_categories` tools; streams over SSE.
  - Editor+ actions: `create_category`, `create_doc`, `update_doc`,
    `fetch_webpage` (clone a public page into a doc).
  - Viewers get read-only tools; tool availability decided server-side from
    the session role.
- First-run: when the users table is empty, `/api/setup` allows creating the
  initial admin from the login screen (closed forever after first user).
- Branding: `site_name` row in `settings`, exposed via public `GET /api/meta`
  (also carries `needs_setup`), editable on the Admin page.

## AI protocol

`POST /api/ai/chat` body `{messages: [{role, content: string}]}` →
`text/event-stream` of JSON lines:

- `{"t":"text","v":"…delta…"}`
- `{"t":"tool","name":"create_doc","detail":"Adding New Coupon","link":"/doc/s/…"}`
- `{"t":"done"}` / `{"t":"error","v":"…"}`

Server runs a manual streaming agentic loop (max 15 iterations), system prompt
cached with `cache_control: ephemeral`, adaptive thinking enabled. Client keeps
plain-text history only; each request is a fresh loop (no tool blocks
round-tripped).

Everything else (auth, roles, editor, verbatim HTML rendering, R2 images) is
unchanged from the original design — see git history of the source project.
