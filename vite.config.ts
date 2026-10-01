import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import tauriConfig from "./src-tauri/tauri.conf.json" with { type: "json" };
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react()],
  // The version Tauri builds and the updater compares against, shown in Settings.
  define: { __APP_VERSION__: JSON.stringify(tauriConfig.version) },

  // Keeps Vite from clearing Rust errors off the terminal.
  clearScreen: false,
  // Tauri expects a fixed port, so fail if it's taken.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
