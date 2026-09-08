import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    proxy: {
      "/workspace-api": { target: "http://127.0.0.1:4319", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist-workspace",
    rollupOptions: { input: "workspace.html" },
  },
});
