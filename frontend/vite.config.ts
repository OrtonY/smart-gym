import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.VITE_DEV_HTTPS === "true" ? [basicSsl()] : []),
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
