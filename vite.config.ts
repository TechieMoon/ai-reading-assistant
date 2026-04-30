import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function copyExtensionAssets() {
  return {
    name: "copy-extension-assets",
    closeBundle() {
      mkdirSync(resolve(__dirname, "dist"), { recursive: true });
      mkdirSync(resolve(__dirname, "dist", "assets"), { recursive: true });
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist", "manifest.json"));
      copyFileSync(
        resolve(__dirname, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
        resolve(__dirname, "dist", "assets", "pdf.worker.mjs")
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionAssets()],
  build: {
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "sidepanel.html"),
        options: resolve(__dirname, "options.html"),
        popup: resolve(__dirname, "popup.html"),
        pdfReader: resolve(__dirname, "pdf-reader.html"),
        background: resolve(__dirname, "src/background/serviceWorker.ts"),
        content: resolve(__dirname, "src/content/contentScript.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
