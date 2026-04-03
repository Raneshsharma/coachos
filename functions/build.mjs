// esbuild bundler for Firebase Cloud Functions.
// Bundles the entire monorepo API (apps/api/src + packages/domain/src)
// into a single CommonJS file at lib/index.js, resolving all path aliases.
import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outdir: "lib",
  format: "cjs",
  // firebase-functions and pg have native code — keep them as external
  // so Firebase includes them from node_modules at runtime.
  external: ["firebase-functions", "firebase-admin", "pg"],
  // Resolve monorepo path aliases
  alias: {
    "@coachos/domain": resolve(__dirname, "../packages/domain/src/index.ts"),
    "@coachos/ui": resolve(__dirname, "../packages/ui/src/index.tsx"),
  },
});

console.log("✅ Firebase Functions bundled → lib/index.js");
