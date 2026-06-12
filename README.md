# Lorebase

Self-hosted documentation site with a built-in AI assistant. One Cloudflare
Worker, zero servers to manage. Built for teams that want a private,
login-protected knowledge base they fully own — with an AI that answers
questions *from the docs* and can even write docs for you.

**Stack:** React + Vite SPA · Hono API · Cloudflare Workers · D1 (SQLite) ·
R2 (images) · Anthropic Claude (AI assistant) · TipTap editor

## Features

- 📚 **Categories & docs** with emoji icons, collapsible sidebar, title search
- ✍️ **WYSIWYG editor** (TipTap) — headings, font sizes, lists, tables, links,
  image paste/upload straight to your R2 bucket
- 🔐 **Login-protected** — everything behind a session, including images
- 👥 **Roles** — `admin` (manage users), `editor` (manage content), `viewer`
  (read-only), enforced server-side
- 📌 **Pinned doc** — make any doc the post-login landing page
- ✨ **AI assistant** (Anthropic Claude):
  - Ask anything — it searches your docs, reads them, and answers with links
  - Editors can tell it to **create categories and docs** in one shot
  - **Clone a public web page** into a doc: "clone https://… into Getting Started"
  - Role-aware: viewers get read-only answers, editors get write tools
- 🚀 **First-run setup** — create the admin account from the browser, no CLI
- 📦 **Importers** — migrate from a Dewstack site or a folder of HTML exports

## Quickstart

Prerequisites: Node.js ≥ 22, a Cloudflare account (free tier is plenty;
R2 requires a card on file even on free tier).

```sh
git clone https://github.com/YOU/lorebase && cd lorebase
npm install

# 1. Authenticate wrangler
npx wrangler login

# 2. Create the database and bucket
npx wrangler d1 create lorebase        # paste the database_id into wrangler.jsonc
npx wrangler r2 bucket create lorebase-images

# 3. Apply the schema
npx wrangler d1 migrations apply lorebase --remote

# 4. (Optional) enable the AI assistant
npx wrangler secret put ANTHROPIC_API_KEY   # key from console.anthropic.com

# 5. Deploy
npm run deploy
```

Open the printed `*.workers.dev` URL — the first visit shows a **setup screen**
where you name the site and create your admin account. Done.

### Local development

```sh
npx wrangler d1 migrations apply lorebase --local
npm run dev
```

For the AI assistant locally, put the key in `.dev.vars`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## The AI assistant

Click **✨ Ask AI** (bottom right). The assistant runs an agentic loop on the
Worker against the Claude API with these tools:

| Tool | Who | What |
|---|---|---|
| `search_docs`, `read_doc`, `list_categories` | everyone | Grounds answers in your docs, with links |
| `create_category`, `create_doc`, `update_doc` | editor/admin | "Write a doc about X in category Y" |
| `fetch_webpage` | editor/admin | "Clone this URL into the docs" |

Configuration:

- `ANTHROPIC_API_KEY` (secret) — without it the assistant returns a friendly
  "not configured" error; everything else works.
- `AI_MODEL` (var in `wrangler.jsonc`) — defaults to `claude-opus-4-8`.
  Use `claude-sonnet-4-6` for lower cost.

The system prompt is cached (Anthropic prompt caching), so repeat questions are
cheap. Tool access is decided server-side from the session role — a viewer
cannot make the model write, no matter what they type.

## Importing existing content

**From Dewstack** (preserves HTML byte-for-byte, including all styling):

```sh
DEWSTACK_HOST=yoursite.dewstack.com npx tsx scripts/import-from-dewstack.ts
npx wrangler d1 execute lorebase --remote --file data/seed_content.sql
```

Optionally move the Cloudinary-hosted images into your own R2 first, so your
site survives the Dewstack subscription ending:

```sh
DEWSTACK_HOST=... SITE=https://your-site.workers.dev COOKIE="session=..." \
  npx tsx scripts/migrate-images.ts      # writes data/image-map.json
DEWSTACK_HOST=... npx tsx scripts/import-from-dewstack.ts   # applies the map
npx wrangler d1 execute lorebase --remote --file data/seed_content.sql
```

(The `COOKIE` value is your `session` cookie after logging in as an editor —
copy it from the browser dev tools.)

**From a folder of HTML files** (one subfolder per category):

```sh
npx tsx scripts/import-html-folder.ts /path/to/export
npx wrangler d1 execute lorebase --remote --file data/seed_content.sql
```

⚠️ Both importers **replace all existing docs** — they're for initial
migration, not syncing.

**Seed an admin from the CLI** (alternative to the setup screen):

```sh
npx wrangler d1 execute lorebase --remote \
  --command "$(npx tsx scripts/seed-admin.ts you@example.com 'Your Name' 'password123')"
```

## Architecture

```
Cloudflare Worker
├── /            React SPA (static assets, SPA fallback)
├── /api/*       Hono API  — sessions (HttpOnly cookie), role checks
│   ├── auth     login / logout / me
│   ├── meta     site name + first-run flag (public)
│   ├── setup    create first admin (only while users table is empty)
│   ├── categories, documents, settings, users
│   ├── images   multipart upload → R2
│   └── ai/chat  SSE stream — Claude agentic loop with doc tools
├── /images/:key R2-backed image serving (session required)
└── D1           categories, documents (verbatim HTML), users, sessions, settings
```

Notable choices:

- **Content is stored as raw HTML** and rendered sanitized-but-unchanged
  (DOMPurify) — imported docs keep their exact original styling.
- Passwords: PBKDF2 via WebCrypto (Workers-native, no native deps).
- Documents over D1's ~100KB statement limit are seeded via chunked appends.

## Custom domain

Cloudflare dashboard → Workers & Pages → lorebase → Settings → Domains &
Routes → add your domain. No code changes needed.

## Development

```sh
npm test            # vitest unit tests
npx tsc --noEmit    # typecheck
npm run dev         # local dev server (local D1/R2 simulators)
npm run deploy      # build + deploy
```

## License

[MIT](LICENSE)
