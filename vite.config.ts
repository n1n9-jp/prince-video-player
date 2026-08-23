import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const libraryProxy = {
  "/api": {
    target: "https://prince-tube.tokyo-air.workers.dev",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: libraryProxy,
  },
  preview: {
    proxy: libraryProxy,
  },
});
