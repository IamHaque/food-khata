import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:8765" } },
  preview: { host: "127.0.0.1" },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ["echarts"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/.git/**", "src/*.test.js"],
  },
});