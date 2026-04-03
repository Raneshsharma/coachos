import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // VITE_BASE_PATH is set by the GitHub Actions workflow to /coachos/
  // for GitHub Pages deployment. For Vercel (root domain) it stays as "/".
  base: process.env.VITE_BASE_PATH ?? "/",
  resolve: {
    alias: {
      "@coachos/domain": path.resolve(__dirname, "../../packages/domain/src"),
      "@coachos/ui": path.resolve(__dirname, "../../packages/ui/src")
    }
  },
  server: {
    port: 5173
  }
});
