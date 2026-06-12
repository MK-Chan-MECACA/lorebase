// Import all published articles from a Dewstack site's public API into data/seed_content.sql.
// Content is embedded verbatim — only single quotes are SQL-escaped (lossless).
//
// Usage:
//   DEWSTACK_HOST=yoursite.dewstack.com npx tsx scripts/import-from-dewstack.ts
//   npx wrangler d1 execute lorebase [--local|--remote] --file data/seed_content.sql
//
// Optional: if scripts/migrate-images.ts produced data/image-map.json, image URLs
// are rewritten to this site's /images/ paths.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFolder, sqlEscape } from "./import-helpers";

const HOST = process.env.DEWSTACK_HOST;
if (!HOST) {
  console.error("usage: DEWSTACK_HOST=yoursite.dewstack.com npx tsx scripts/import-from-dewstack.ts");
  process.exit(1);
}
const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

const mapPath = join(appDir, "data", "image-map.json");
const imageMap: Record<string, string> = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : {};
const rewriteImages = (html: string) =>
  html.replace(/https?:\/\/res\.cloudinary\.com\/[^"'\s)]+/g, (u) => imageMap[u] ?? u);

// Rewrite cross-doc links pointing at the old Dewstack site to internal slug routes
const makeLinkRewriter = (knownSlugs: Set<string>) => (html: string) =>
  html.replace(
    new RegExp(`https?:\\/\\/[a-z0-9.-]*${HOST.replace(/\./g, "\\.")}\\/[a-z0-9-]+\\/docs\\/[a-z0-9-]+\\/([a-z0-9-]+)`, "g"),
    (full, slug) => (knownSlugs.has(slug) ? `/doc/s/${slug}` : full),
  );

type Article = {
  id: number; name: string; type: string; slug: string; content: string;
  created_at: string; updated_at: string; collection_slug: string; status: string;
};
type Collection = { id: number; name: string; slug: string };

const [collectionsRes, articlesRes] = await Promise.all([
  fetch(`https://app.dewstack.com/api/public/collections/${HOST}`),
  fetch(`https://app.dewstack.com/api/public/articles/${HOST}`),
]);
if (!collectionsRes.ok || !articlesRes.ok) {
  throw new Error(`API failed: collections ${collectionsRes.status}, articles ${articlesRes.status}`);
}
const collections: Collection[] = ((await collectionsRes.json()) as { data: { collections: Collection[] } }).data.collections;
const articles: Article[] = ((await articlesRes.json()) as { data: { articles: Article[] } }).data.articles;

// Collections API can omit some collections — recover them from articles
const known = new Set(collections.map((c) => c.slug));
for (const a of articles) {
  if (!known.has(a.collection_slug)) {
    known.add(a.collection_slug);
    collections.push({ id: -1, name: a.type, slug: a.collection_slug });
  }
}

const lines: string[] = ["DELETE FROM documents;", "DELETE FROM categories;"];
const catIdBySlug = new Map<string, number>();

collections.forEach((col, i) => {
  const { emoji, name } = parseFolder(col.name.replace(/\s+/g, " ").trim());
  const id = i + 1;
  catIdBySlug.set(col.slug, id);
  lines.push(
    `INSERT INTO categories (id, name, emoji, sort_order) VALUES (${id}, '${sqlEscape(name)}', '${sqlEscape(emoji)}', ${id});`,
  );
});

const rewriteLinks = makeLinkRewriter(new Set(articles.filter((a) => a.status === "Publish").map((a) => a.slug)));
const usedSlugs = new Set<string>();
let docCount = 0;
let skipped = 0;
const CHUNK = 50_000; // D1 rejects statements over ~100KB (SQLITE_TOOBIG)

for (const a of articles) {
  if (a.status !== "Publish") { skipped++; continue; }
  const catId = catIdBySlug.get(a.collection_slug);
  if (!catId) { skipped++; continue; }
  let slug = a.slug || `doc-${a.id}`;
  for (let n = 2; usedSlugs.has(slug); n++) slug = `${a.slug}-${n}`;
  usedSlugs.add(slug);
  const created = a.created_at.replace("T", " ").replace(/\+.*$/, "");
  const updated = a.updated_at.replace("T", " ").replace(/\+.*$/, "");
  lines.push(
    `INSERT INTO documents (category_id, title, slug, content_html, created_at, updated_at, updated_by) ` +
      `VALUES (${catId}, '${sqlEscape(a.name.trim())}', '${sqlEscape(slug)}', '', '${created}', '${updated}', 'import');`,
  );
  const html = rewriteLinks(rewriteImages(a.content ?? ""));
  for (let off = 0; off < html.length; off += CHUNK) {
    lines.push(
      `UPDATE documents SET content_html = content_html || '${sqlEscape(html.slice(off, off + CHUNK))}' WHERE slug = '${sqlEscape(slug)}';`,
    );
  }
  docCount++;
}

mkdirSync(join(appDir, "data"), { recursive: true });
writeFileSync(join(appDir, "data", "seed_content.sql"), lines.join("\n") + "\n");
console.log(`categories: ${collections.length}, documents: ${docCount}, skipped: ${skipped}`);
console.log(`wrote data/seed_content.sql`);
