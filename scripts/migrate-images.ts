// Migrate Cloudinary-hosted images from a Dewstack site to this site's R2 bucket.
// Downloads each unique res.cloudinary.com URL found in the Dewstack articles,
// uploads it through the deployed site's /api/images endpoint (admin session
// cookie required), and writes data/image-map.json: { [cloudinaryUrl]: "/images/<key>" }.
// Run scripts/import-from-dewstack.ts afterwards — it applies the map.
// Re-runnable: existing mappings are kept, only missing ones are fetched.
//
// Usage:
//   DEWSTACK_HOST=yoursite.dewstack.com \
//   SITE=https://your-site.workers.dev \
//   COOKIE="session=..." npx tsx scripts/migrate-images.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.DEWSTACK_HOST;
const SITE = process.env.SITE;
const COOKIE = process.env.COOKIE;
if (!HOST || !SITE || !COOKIE) {
  console.error("DEWSTACK_HOST, SITE and COOKIE env vars are required (see header comment)");
  process.exit(1);
}

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const mapPath = join(appDir, "data", "image-map.json");
mkdirSync(join(appDir, "data"), { recursive: true });
const map: Record<string, string> = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : {};

const articlesRes = await fetch(`https://app.dewstack.com/api/public/articles/${HOST}`);
const articles: { content: string }[] = ((await articlesRes.json()) as { data: { articles: { content: string }[] } })
  .data.articles;
const urls = new Set<string>();
for (const a of articles) {
  for (const m of (a.content ?? "").matchAll(/https?:\/\/res\.cloudinary\.com\/[^"'\s)]+/g)) urls.add(m[0]);
}

const todo = [...urls].filter((u) => !map[u]);
console.log(`unique: ${urls.size}, already mapped: ${urls.size - todo.length}, to migrate: ${todo.length}`);

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
let done = 0;
let failed = 0;

async function migrate(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = await res.arrayBuffer();
    const ext = (url.split(".").pop() ?? "").toLowerCase().split(/[?#]/)[0];
    const type = TYPES[ext] ?? res.headers.get("content-type") ?? "image/png";
    if (!TYPES[ext] && !Object.values(TYPES).includes(type)) throw new Error(`unsupported type ${type}`);
    const form = new FormData();
    form.append("file", new Blob([buf], { type }), `img.${ext || "png"}`);
    const up = await fetch(`${SITE}/api/images`, { method: "POST", body: form, headers: { cookie: COOKIE! } });
    if (!up.ok) throw new Error(`upload ${up.status}: ${await up.text()}`);
    const { url: newUrl } = (await up.json()) as { url: string };
    map[url] = newUrl;
  } catch (e) {
    failed++;
    console.error(`FAIL ${url}: ${e instanceof Error ? e.message : e}`);
  } finally {
    done++;
    if (done % 100 === 0) {
      writeFileSync(mapPath, JSON.stringify(map, null, 1));
      console.log(`${done}/${todo.length} (${failed} failed)`);
    }
  }
}

const CONCURRENCY = 8;
let i = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (i < todo.length) await migrate(todo[i++]);
  }),
);

writeFileSync(mapPath, JSON.stringify(map, null, 1));
console.log(`done. mapped: ${Object.keys(map).length}, failed: ${failed}`);
