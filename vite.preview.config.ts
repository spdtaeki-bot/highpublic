import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const sampleDispatchService = path.resolve(__dirname, "src/preview/sampleDispatchService.ts");

/**
 * 샘플 데이터만 쓰는 미리보기 빌드.
 * 운영 앱 엔트리와 Firestore 연결은 넣지 않는다.
 */
export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /.*services\/dispatchService$/, replacement: sampleDispatchService }],
  },
  build: {
    outDir: "speed-preview-site",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "speed-preview.html"),
    },
  },
});
