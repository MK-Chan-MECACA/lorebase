// Import a folder tree of exported HTML fragments into data/seed_content.sql.
// Layout: <root>/<Category Name>/<doc_file>.html — one subfolder per category.
// Folder names may start with an emoji ("🚀 Getting Started"); filenames in
// snake_case (optionally with a trailing -<timestamp>) become Title Case titles.
// Content is embedded verbatim.
//
// Usage:
//   npx tsx scripts/import-html-folder.ts /path/to/export
//   npx wrangler d1 execute lorebase [--local|--remote] --file data/seed_content.sql
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFilename, parseFolder, sqlEscape } from "./import-helpers";

const root = process.argv[2];
if (!root) {
  console.error("usage: npx tsx scripts/import-html-folder.ts /path/to/export");
  process.exit(1);
}
const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

const folders = readdirSync(root)
  .filter((f) => !f.startsWith(".") && statSync(join(root, f)).isDirectory())
  .sort();

const lines: string[] = ["DELETE FROM documents;", "DELETE FROM categories;"];
const usedSlugs = new Set<string>();
let docCount = 0;
const CHUNK = 50_000; // D1 rejects statements over ~100KB (SQLITE_TOOBIG)

folders.forEach((folder, i) => {
  const { emoji, name } = parseFolder(folder);
  const catId = i + 1;
  lines.push(
    `INSERT INTO categories (id, name, emoji, sort_order) VALUES (${catId}, '${sqlEscape(name)}', '${sqlEscape(emoji)}', ${catId});`,
  );

  const files = readdirSync(join(root, folder))
    .filter((f) => f.endsWith(".html"))
    .sort();
  for (const file of files) {
    const { title, slug: baseSlug } = parseFilename(file);
    let slug = baseSlug;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${baseSlug}-${n}`;
    usedSlugs.add(slug);
    const html = readFileSync(join(root, folder, file), "utf8");
    lines.push(
      `INSERT INTO documents (category_id, title, slug, content_html, updated_by) ` +
        `VALUES (${catId}, '${sqlEscape(title)}', '${slug}', '', 'import');`,
    );
    for (let off = 0; off < html.length; off += CHUNK) {
      lines.push(
        `UPDATE documents SET content_html = content_html || '${sqlEscape(html.slice(off, off + CHUNK))}' WHERE slug = '${slug}';`,
      );
    }
    docCount++;
  }
});

mkdirSync(join(appDir, "data"), { recursive: true });
writeFileSync(join(appDir, "data", "seed_content.sql"), lines.join("\n") + "\n");
console.log(`categories: ${folders.length}, documents: ${docCount}`);
console.log(`wrote data/seed_content.sql`);
