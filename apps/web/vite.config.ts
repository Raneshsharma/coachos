import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@coachos/domain": path.resolve(__dirname, "../../packages/domain/src"),
      "@coachos/ui": path.resolve(__dirname, "../../packages/ui/src")
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        client: resolve(__dirname, "client/login.html"),
      },
    },
  },
  server: {
    port: 5173
  }
});
