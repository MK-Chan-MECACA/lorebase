import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Deploy against an alternate config (e.g. a private per-site one) with:
//   WRANGLER_CONFIG=wrangler.mysite.jsonc npm run deploy
export default defineConfig({
  plugins: [react(), cloudflare({ configPath: process.env.WRANGLER_CONFIG })],
});
