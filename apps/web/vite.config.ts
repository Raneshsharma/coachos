import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
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
