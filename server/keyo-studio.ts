import type { Express } from "express";
import express from "express";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildKeyoRelease, KEYO_FILENAME } from "../scripts/keyo-release";
import { keyoStudioPage } from "./keyo-studio-page";
import { KEYO_UPLOAD_FILENAME, KEYO_SPACE_UPLOAD_FILENAME } from "../scripts/keyo-upload-zip";

let pending: Promise<Awaited<ReturnType<typeof buildKeyoRelease>>> | undefined;
async function release() {
  if (!pending) {
    pending = (async () => {
      try {
        const manifest = JSON.parse(await readFile(path.resolve("dist/keyo-studio/release.json"), "utf8"));
        await stat(path.resolve("dist/keyo-studio", KEYO_FILENAME));
        await stat(path.resolve("dist/keyo-studio", KEYO_UPLOAD_FILENAME));
        await stat(path.resolve("dist/keyo-studio", KEYO_SPACE_UPLOAD_FILENAME));
        if (manifest.huggingFaceUpload?.filename !== KEYO_SPACE_UPLOAD_FILENAME) throw Object.assign(new Error("Space upload ZIP requires rebuilding."), { code: "ENOENT" });
        if (manifest.manualUpload?.filename !== KEYO_UPLOAD_FILENAME) throw Object.assign(new Error("Manual upload ZIP requires rebuilding."), { code: "ENOENT" });
        if (manifest.downloadUrl !== `/downloads/keyo-studio/${KEYO_FILENAME}`) throw new Error("Release contract mismatch.");
        return manifest;
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
        // Development fallback. Production builds package the release once.
        return buildKeyoRelease();
      }
    })().catch(error => { pending = undefined; throw error; });
  }
  return pending;
}

export function registerKeyoStudio(app: Express) {
  app.get("/keyo-studio/workspace", (req,res,next) => {
    if (req.path.endsWith("/")) return next();
    res.redirect(302,"/keyo-studio/workspace/");
  });
  app.use("/keyo-studio/workspace/",express.static(path.resolve(process.env.NODE_ENV === "production"
    ? "dist/keyo-studio/workspace" : "packages/keyo-studio/desktop/renderer"),{
    dotfiles:"deny",maxAge:0,
    setHeaders:res => {
      res.setHeader("Cache-Control","no-store");
      res.setHeader("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://replit.com https://*.replit.com");
    }
  }));
  app.get("/keyo-studio", (_req, res) => {
    res.set("Cache-Control", "no-store").type("html").send(keyoStudioPage());
  });
  app.get("/api/keyo-studio/release", async (_req, res) => {
    try { res.set("Cache-Control", "no-store").json(await release()); }
    catch { res.status(503).json({ message: "KEYO release is unavailable. Please try again later." }); }
  });
  app.get(`/downloads/keyo-studio/${KEYO_UPLOAD_FILENAME}`, async (_req, res) => {
    try {
      const manifest = await release();
      res.set("Cache-Control", "no-store");
      res.set("X-Content-SHA256", manifest.manualUpload.sha256);
      res.set("X-Content-Type-Options", "nosniff");
      res.download(path.resolve("dist/keyo-studio", KEYO_UPLOAD_FILENAME), KEYO_UPLOAD_FILENAME, error => {
        if (error && !res.headersSent) res.status(503).json({ message: "KEYO ZIP is unavailable." });
      });
    } catch { res.status(503).json({ message: "KEYO ZIP is unavailable." }); }
  });
  app.get(`/downloads/keyo-studio/${KEYO_SPACE_UPLOAD_FILENAME}`, async (_req, res) => {
    try {
      const manifest = await release();
      res.set("Cache-Control", "no-store");
      res.set("X-Content-SHA256", manifest.huggingFaceUpload.sha256);
      res.set("X-Content-Type-Options", "nosniff");
      res.download(path.resolve("dist/keyo-studio", KEYO_SPACE_UPLOAD_FILENAME), KEYO_SPACE_UPLOAD_FILENAME, error => {
        if (error && !res.headersSent) res.status(503).json({ message: "KEYO Space ZIP is unavailable." });
      });
    } catch { res.status(503).json({ message: "KEYO Space ZIP is unavailable." }); }
  });
  app.get(`/downloads/keyo-studio/${KEYO_FILENAME}`, async (_req, res) => {
    try {
      const manifest = await release();
      res.set("Cache-Control", "no-store");
      res.set("X-Content-SHA256", manifest.sha256);
      res.set("X-Content-Type-Options", "nosniff");
      res.download(path.resolve("dist/keyo-studio", KEYO_FILENAME), KEYO_FILENAME, error => {
        if (error && !res.headersSent) res.status(503).json({ message: "KEYO download is unavailable." });
      });
    } catch { res.status(503).json({ message: "KEYO download is unavailable." }); }
  });
}
