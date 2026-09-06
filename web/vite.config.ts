import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webappRoot = resolve(repoRoot, "src/adassassin/webapp");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "package-operator-policies",
      closeBundle() {
        for (const name of ["AUTHORIZED_USE.md", "SECURITY.md", "ROADMAP.md"]) {
          copyFileSync(resolve(repoRoot, name), resolve(webappRoot, name));
        }
      },
    },
  ],
  base: "/",
  // The canonical operator documents are copied into the production webapp
  // so wheel installs retain the same offline guide as a source checkout.
  publicDir: "../docs",
  build: {
    outDir: "../src/adassassin/webapp",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8745",
    },
  },
});
