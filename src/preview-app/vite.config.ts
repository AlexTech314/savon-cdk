import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    fs: {
      // Allow serving files from the dummy-data folder
      allow: [".", "../dummy-data"],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});

