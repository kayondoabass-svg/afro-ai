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
    // Extract just the pathname (no query string)
    const pathname = (req.originalUrl || req.path || "/").split("?")[0] || "/";
    const canonicalUrl = `https://afroaigroup.com${pathname}`;
    // Remove any existing canonical/og:url tags (handles any attribute ordering)
    html = html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/gi, "");
    html = html.replace(/<link[^>]*rel=canonical[^>]*>/gi, "");
    html = html.replace(/<meta[^>]*property=["']og:url["'][^>]*>/gi, "");
    // Inject fresh canonical + og:url before </head>
    const injection = `  <link rel="canonical" href="${canonicalUrl}" />\n  <meta property="og:url" content="${canonicalUrl}" />\n`;
    html = html.replace("</head>", `${injection}</head>`);
    res.set("Content-Type", "text/html").send(html);
  });
}
