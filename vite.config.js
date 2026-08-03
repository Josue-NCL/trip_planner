import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/trip/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(moduleId) {
          if (!moduleId.includes("node_modules")) {
            return undefined;
          }
          if (/\/(react|react-dom|scheduler)@/.test(moduleId)) {
            return "react-vendor";
          }
          if (moduleId.includes("/@supabase+") || moduleId.includes("/iceberg-js@")) {
            return "supabase-vendor";
          }
          if (moduleId.includes("/react-hook-form@") || moduleId.includes("/@hookform+resolvers@")) {
            return "forms-vendor";
          }
          if (moduleId.includes("/zod@")) {
            return "validation-vendor";
          }
          if (moduleId.includes("/lucide-react@") || moduleId.includes("/sonner@")) {
            return "ui-vendor";
          }
          if (moduleId.includes("/dinero.js@")) {
            return "money-vendor";
          }
          return undefined;
        }
      }
    }
  }
});
