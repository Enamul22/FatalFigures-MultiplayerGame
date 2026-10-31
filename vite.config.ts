import { defineConfig } from "vite";
export default defineConfig({
  root: "web",
  build: { outDir: "../dist/web", emptyOutDir: false },
  server: { host: "127.0.0.1" },
});
