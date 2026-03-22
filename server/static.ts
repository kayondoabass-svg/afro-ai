import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html with dynamic canonical URL injection per page
  app.use("/{*path}", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    let html = fs.readFileSync(indexPath, "utf-8");
    const canonicalUrl = `https://afroaigroup.com${req.path === "/" ? "/" : req.path}`;
    html = html.replace(
      /(<link rel="canonical" href=")[^"]*(")/,
      `$1${canonicalUrl}$2`
    );
    html = html.replace(
      /(<meta property="og:url" content=")[^"]*(")/,
      `$1${canonicalUrl}$2`
    );
    res.set("Content-Type", "text/html").send(html);
  });
}
