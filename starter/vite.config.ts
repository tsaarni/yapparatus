import { defineConfig } from "vite";
import { yapparatus } from "yapparatus/vite";

export default defineConfig(({ mode }) => ({
  plugins: yapparatus({ singleFile: mode === "single" }),
}));
