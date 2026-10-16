import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const emptyFirebaseConfig = path.resolve(__dirname, "src/preview/empty-firebase-config.json");

/**
 * 입금 대조 샘플 페이지만 빌드한다.
 * 운영 앱 엔트리와 Firebase 설정을 넣지 않는다.
 */
export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /firebase-applet-config\.json$/, replacement: emptyFirebaseConfig },
    ],
  },
  build: {
    outDir: "deposit-preview-site",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "deposit-preview.html"),
    },
  },
});
