export function parseFilename(filename: string): { title: string; slug: string } {
  const base = filename.replace(/-\d+\.html$/, "");
  const words = base.split(/_+/).filter(Boolean);
  const title = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  const slug = words
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return { title, slug };
}

export function parseFolder(folder: string): { emoji: string; name: string } {
  // Full emoji sequence: pictographic char + optional variation selector, joined by ZWJ
  const m = folder.match(/^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*(.+)$/u);
  if (m) return { emoji: m[1], name: m[2].trim() };
  return { emoji: "", name: folder.trim() };
}

export const sqlEscape = (s: string): string => s.replaceAll("'", "''");
