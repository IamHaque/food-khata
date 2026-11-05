import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "../food_khata/dashboard_assets",
    emptyOutDir: false,
    assetsInlineLimit: 10000000,
    cssCodeSplit: false,
    lib: {
      entry: "src/main.jsx",
      name: "FoodKhata",
      formats: ["iife"],
      fileName: () => "app.js",
    },
    rollupOptions: { output: { assetFileNames: "app.[ext]" } },
  },
});
