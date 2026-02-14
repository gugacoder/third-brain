import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5000,
    proxy: {
      "/api": "http://localhost:5001",
      "/sse": {
        target: "http://localhost:5001",
        headers: { Connection: "keep-alive" },
      },
    },
  },
});
