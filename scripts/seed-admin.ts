// Print SQL that creates/replaces an admin user.
// Usage: npx tsx scripts/seed-admin.ts <email> <name> <password>
// Pipe into: wrangler d1 execute lorebase [--local|--remote] --command "$(...)"
import { hashPassword } from "../src/server/crypto";

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password) {
  console.error("usage: tsx scripts/seed-admin.ts <email> <name> <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("password must be at least 8 characters");
  process.exit(1);
}
const esc = (s: string) => s.replaceAll("'", "''");
const hash = await hashPassword(password);
console.log(
  `INSERT INTO users (email, name, password_hash, role) VALUES ('${esc(email.toLowerCase())}', '${esc(name)}', '${hash}', 'admin') ` +
    `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin';`,
);
