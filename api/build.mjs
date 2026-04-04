// Bundles api/index.ts into a standalone api/index.js for Vercel Lambda
import * as esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync, writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [resolve(__dirname, "index.ts")],
  outfile: resolve(__dirname, "index.js"),
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  external: [],
  sourcemap: false,
  minify: false,
  banner: {
    js: `import { createRequire } from "module";import { fileURLToPath } from "url";import { dirname } from "path";const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);`,
  },
});

console.log("✓ API bundle written to api/index.js");
