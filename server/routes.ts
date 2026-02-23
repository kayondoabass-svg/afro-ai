import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated, isFounder } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { storage } from "./storage";
import { insertProjectSchema } from "@shared/schema";
import { createSubdomainRecord, deleteSubdomainRecord, isValidSubdomain, getPublishedUrl } from "./cloudflare";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";

const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: fileStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const blocked = /svg/i;
    const allowed = /^(image|video)\//;
    if (blocked.test(file.mimetype) || blocked.test(file.originalname)) {
      cb(new Error("SVG files are not allowed for security reasons"));
    } else if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/uploads", express.static(uploadDir));

  app.use(async (req, res, next) => {
    const host = req.hostname || req.headers.host?.split(":")[0] || "";
    const baseDomain = "afroaigroup.com";
    if (host !== baseDomain && host.endsWith("." + baseDomain)) {
      const subdomain = host.replace("." + baseDomain, "");
      if (subdomain && subdomain !== "www") {
        try {
          const publishedApp = await storage.getPublishedAppBySubdomain(subdomain);
          if (publishedApp) {
            return res.send(publishedApp.htmlContent);
          }
          return res.status(404).send(
            '<!DOCTYPE html><html><head><title>Not Found</title>' +
            '<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#d4af37;}' +
            '.c{text-align:center;}h1{font-size:3rem;}p{color:#888;}</style></head>' +
            '<body><div class="c"><h1>404</h1><p>This site doesn\'t exist yet.</p>' +
            '<a href="https://afroaigroup.com" style="color:#d4af37;">Build one with Afro AI</a></div></body></html>'
          );
        } catch (err) {
          console.error("Subdomain routing error:", err);
          return res.status(500).send("Internal server error");
        }
      }
    }
    next();
  });

  await setupAuth(app);
  registerAuthRoutes(app);
  registerChatRoutes(app);

  app.post("/api/upload", isAuthenticated, upload.array("files", 5), (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }
      const result = files.map((f) => ({
        filename: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/${f.filename}`,
      }));
      res.json(result);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: error.message || "Failed to upload file" });
    }
  });

  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projects = await storage.getProjectsByUser(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = insertProjectSchema.parse({ ...req.body, userId });
      const project = await storage.createProject(parsed);
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const userId = req.user.claims.sub;
      if (project.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteProject(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.get("/api/published-apps", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const apps = await storage.getPublishedAppsByUser(userId);
      res.json(apps);
    } catch (error) {
      console.error("Error fetching published apps:", error);
      res.status(500).json({ message: "Failed to fetch published apps" });
    }
  });

  app.post("/api/publish", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { subdomain, htmlContent, title } = req.body;

      if (!subdomain || !htmlContent || !title) {
        return res.status(400).json({ message: "Subdomain, HTML content, and title are required" });
      }

      const subdomainLower = subdomain.toLowerCase().trim();
      const validation = isValidSubdomain(subdomainLower);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const existing = await storage.getPublishedAppBySubdomain(subdomainLower);
      if (existing && existing.userId !== userId) {
        return res.status(409).json({ message: "This subdomain is already taken" });
      }

      if (existing && existing.userId === userId) {
        let dnsRecordId = existing.cloudflareDnsRecordId;
        if (!dnsRecordId) {
          try {
            dnsRecordId = await createSubdomainRecord(subdomainLower);
          } catch (err) {
            console.error("Cloudflare DNS error:", err);
          }
        }

        const updated = await storage.updatePublishedApp(existing.id, {
          htmlContent,
          title,
          cloudflareDnsRecordId: dnsRecordId || undefined,
        });
        return res.json({ ...updated, url: getPublishedUrl(subdomainLower) });
      }

      let dnsRecordId: string | undefined;
      try {
        dnsRecordId = await createSubdomainRecord(subdomainLower);
      } catch (err) {
        console.error("Cloudflare DNS error:", err);
      }

      const published = await storage.createPublishedApp({
        userId,
        subdomain: subdomainLower,
        htmlContent,
        title,
        cloudflareDnsRecordId: dnsRecordId || null,
      });

      res.status(201).json({ ...published, url: getPublishedUrl(subdomainLower) });
    } catch (error: any) {
      console.error("Error publishing app:", error);
      res.status(500).json({ message: error.message || "Failed to publish app" });
    }
  });

  app.delete("/api/published-apps/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const apps = await storage.getPublishedAppsByUser(userId);
      const app = apps.find(a => a.id === id);

      if (!app) {
        return res.status(404).json({ message: "Published app not found" });
      }

      if (app.cloudflareDnsRecordId) {
        try {
          await deleteSubdomainRecord(app.cloudflareDnsRecordId);
        } catch (err) {
          console.error("Failed to delete DNS record:", err);
        }
      }

      await storage.deletePublishedApp(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting published app:", error);
      res.status(500).json({ message: "Failed to delete published app" });
    }
  });

  app.get("/api/check-subdomain/:subdomain", async (req, res) => {
    try {
      const subdomain = req.params.subdomain.toLowerCase().trim();
      const validation = isValidSubdomain(subdomain);
      if (!validation.valid) {
        return res.json({ available: false, error: validation.error });
      }
      const existing = await storage.getPublishedAppBySubdomain(subdomain);
      res.json({ available: !existing });
    } catch (error) {
      console.error("Error checking subdomain:", error);
      res.status(500).json({ available: false, error: "Failed to check subdomain" });
    }
  });

  app.get("/site/:subdomain", async (req, res) => {
    try {
      const subdomain = req.params.subdomain.toLowerCase().trim();
      const app = await storage.getPublishedAppBySubdomain(subdomain);
      if (!app) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html><head><title>Not Found</title>
          <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#d4af37;}
          .c{text-align:center;}h1{font-size:3rem;}p{color:#888;}</style></head>
          <body><div class="c"><h1>404</h1><p>This site doesn't exist yet.</p><a href="/" style="color:#d4af37;">Build one with Afro AI</a></div></body></html>
        `);
      }
      res.send(app.htmlContent);
    } catch (error) {
      console.error("Error serving published app:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.get("/api/referral", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const code = await storage.getUserReferralCode(userId);
      const stats = await storage.getUserReferralStats(userId);
      const referrals = await storage.getReferralsByReferrer(userId);
      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      res.json({
        referralCode: code,
        referralLink: `${baseUrl}?ref=${code}`,
        ...stats,
        referrals,
      });
    } catch (error) {
      console.error("Error fetching referral info:", error);
      res.status(500).json({ message: "Failed to fetch referral info" });
    }
  });

  app.get("/api/admin/stats", isFounder, async (req, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", isFounder, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/projects", isFounder, async (req, res) => {
    try {
      const allProjects = await storage.getAllProjects();
      res.json(allProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/admin/published-apps", isFounder, async (req, res) => {
    try {
      const allApps = await storage.getAllPublishedApps();
      res.json(allApps);
    } catch (error) {
      console.error("Error fetching published apps:", error);
      res.status(500).json({ message: "Failed to fetch published apps" });
    }
  });

  return httpServer;
}
