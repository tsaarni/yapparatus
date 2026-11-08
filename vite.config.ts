import { defineConfig } from "vite";
import { yapparatus } from "./src/vite.ts";

// YAPPARATUS_CONTENT selects another document folder, e.g. YAPPARATUS_CONTENT=tests/fixtures/content pnpm dev
export default defineConfig(({ mode }) => ({
  plugins: yapparatus({
    content: process.env.YAPPARATUS_CONTENT ?? "docs/design",
    singleFile: mode === "single",
  }),
}));
