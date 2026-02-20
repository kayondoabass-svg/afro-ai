import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { storage } from "./storage";
import { insertProjectSchema } from "@shared/schema";
import { createSubdomainRecord, deleteSubdomainRecord, isValidSubdomain, getPublishedUrl } from "./cloudflare";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerChatRoutes(app);

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
          <body><div class="c"><h1>404</h1><p>This site doesn't exist yet.</p><a href="/" style="color:#d4af37;">Build one with Africa.ai</a></div></body></html>
        `);
      }
      res.send(app.htmlContent);
    } catch (error) {
      console.error("Error serving published app:", error);
      res.status(500).send("Internal server error");
    }
  });

  return httpServer;
}
