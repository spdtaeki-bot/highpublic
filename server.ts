import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes (필요 시 추가)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
  }

  // 모든 경로(*)에 대해 index.html을 반환하여 SPA 라우팅 지원
  app.get('*', async (req, res, next) => {
    const url = req.originalUrl;
    
    // API 요청은 제외
    if (url.startsWith('/api')) {
      return next();
    }

    try {
      let template: string;
      const isProduction = process.env.NODE_ENV === "production" || !vite;

      if (!isProduction && vite) {
        // 개발 모드: index.html을 읽어서 Vite 변환 적용 후 전송
        const fs = await import('fs');
        template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
      } else {
        // 프로덕션 모드: 빌드된 dist/index.html 전송
        const fs = await import('fs');
        const indexPath = path.resolve(process.cwd(), 'dist/index.html');
        
        if (fs.existsSync(indexPath)) {
          template = fs.readFileSync(indexPath, 'utf-8');
        } else {
          // dist/index.html이 없으면 루트의 index.html이라도 시도
          template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        }
      }
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      next(e);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
