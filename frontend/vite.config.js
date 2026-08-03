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
const backendTarget = (
  process.env.VITE_PROXY_TARGET || process.env.VITE_API_URL || "http://127.0.0.1:8001"
).replace(/\/$/, "");

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
    allowedHosts: ["app.analytixhub.ai", "analytixhub.ai"],
    // Optional: use VITE_API_URL= in .env.development (relative) to avoid cross-origin calls
    proxy: {
      // MDQM backend; override with VITE_PROXY_TARGET if your local backend runs on a different port.
      "/auth": { target: backendTarget, changeOrigin: true },
      "/db": { target: backendTarget, changeOrigin: true },
      "/jobs": { target: backendTarget, changeOrigin: true },
      "/tables": { target: backendTarget, changeOrigin: true },
      "/files": { target: backendTarget, changeOrigin: true },
      "/schedules": { target: backendTarget, changeOrigin: true },
      "/schedule-job": { target: backendTarget, changeOrigin: true },
      "/dashboard": { target: backendTarget, changeOrigin: true },
      "/rules": { target: backendTarget, changeOrigin: true },
      "/quarantine": { target: backendTarget, changeOrigin: true },
      "/master-data": { target: backendTarget, changeOrigin: true },
      "/admin": { target: backendTarget, changeOrigin: true },
      "/access-request": { target: backendTarget, changeOrigin: true },
      "/api": { target: backendTarget, changeOrigin: true },
      "/health": { target: backendTarget, changeOrigin: true },
      "/docs": { target: backendTarget, changeOrigin: true },
      "/redoc": { target: backendTarget, changeOrigin: true },
      "/openapi.json": { target: backendTarget, changeOrigin: true },
    },
  },
  preview: {
    allowedHosts: ["app.analytixhub.ai", ".analytixhub.ai"],
  },
});