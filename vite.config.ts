import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const libraryProxy = {
  "/api": {
    target: "https://prince-tube.tokyo-air.workers.dev",
    changeOrigin: true,
  },
};

function stripYoutubeKeyFromClientBuild(): Plugin {
  return {
    name: "strip-youtube-key-from-client-build",
    config(_, { command }) {
      if (command === "build") process.env.VITE_YOUTUBE_API_KEY = "";
    },
  };
}

export default defineConfig({
  plugins: [react(), stripYoutubeKeyFromClientBuild()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: libraryProxy,
  },
  preview: {
    proxy: libraryProxy,
  },
});
