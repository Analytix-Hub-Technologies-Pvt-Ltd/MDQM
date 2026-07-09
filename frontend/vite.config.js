// import path from "path";
// import { fileURLToPath } from "url";
// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import tailwindcss from "@tailwindcss/vite";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

// export default defineConfig({
//   plugins: [react(), tailwindcss()],
//   resolve: {
//     alias: {
//       "@": path.resolve(__dirname, "./src"),
//     },
//   },
//   base: "/MDQM/",
// });


import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "/",
  server: {
    port: 5173,
    // Optional: use VITE_API_URL= in .env.development (relative) to avoid cross-origin calls
    proxy: {
      "/auth": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/db": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/jobs": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/tables": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/files": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/schedules": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/schedule-job": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/dashboard": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/rules": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/quarantine": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/master-data": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/admin": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/access-request": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/docs": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/redoc": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/openapi.json": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});