import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      let page = await vite.transformIndexHtml(url, template);
      // Extract just the pathname (no query string)
      const pathname = req.originalUrl.split("?")[0] || "/";
      const canonicalUrl = `https://afroaigroup.com${pathname}`;
      // Remove any existing canonical/og:url tags (handles any attribute ordering)
      page = page.replace(/<link[^>]*rel=["']canonical["'][^>]*>/gi, "");
      page = page.replace(/<link[^>]*rel=canonical[^>]*>/gi, "");
      page = page.replace(/<meta[^>]*property=["']og:url["'][^>]*>/gi, "");
      // Inject fresh canonical + og:url before </head>
      const injection = `  <link rel="canonical" href="${canonicalUrl}" />\n  <meta property="og:url" content="${canonicalUrl}" />\n`;
      page = page.replace("</head>", `${injection}</head>`);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
