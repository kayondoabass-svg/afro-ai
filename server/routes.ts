import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated, isFounder } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { storage } from "./storage";
import { insertProjectSchema } from "@shared/schema";
import { createSubdomainRecord, deleteSubdomainRecord, isValidSubdomain, getPublishedUrl } from "./cloudflare";
import { registerIpnUrl, submitOrder, getTransactionStatus, isPaymentComplete, isPaymentFailed } from "./pesapal";
import { analyzeImage } from "./gemini";
import { checkDomainAvailability, checkSingleDomain, registerDomain, listDomains, getDomainInfo, renewDomain, setNameservers, getCostPrice } from "./namedotcom";
import { scanHtmlContent, publishedAppHeaders } from "./security";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import crypto from "crypto";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const publishLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Publishing rate limit reached. Please try again later." },
});

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

  const serveSuspendedPage = (res: any) => res.status(403).send(
    '<!DOCTYPE html><html><head><title>Site Suspended</title></head>' +
    '<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#ef4444;">' +
    '<div style="text-align:center;"><h1>Site Suspended</h1><p style="color:#888;">This site has been temporarily taken offline.</p>' +
    '<a href="https://afroaigroup.com" style="color:#d4af37;">Afro AI</a></div></body></html>'
  );

  const serveNotFoundPage = (res: any) => res.status(404).send(
    '<!DOCTYPE html><html><head><title>Not Found</title>' +
    '<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#d4af37;}' +
    '.c{text-align:center;}h1{font-size:3rem;}p{color:#888;}</style></head>' +
    '<body><div class="c"><h1>404</h1><p>This site doesn\'t exist yet.</p>' +
    '<a href="https://afroaigroup.com" style="color:#d4af37;">Build one with Afro AI</a></div></body></html>'
  );

  app.use(async (req, res, next) => {
    const host = req.hostname || req.headers.host?.split(":")[0] || "";
    const baseDomain = "afroaigroup.com";

    if (host !== baseDomain && host.endsWith("." + baseDomain)) {
      const subdomain = host.replace("." + baseDomain, "");
      if (subdomain && subdomain !== "www") {
        try {
          const publishedApp = await storage.getPublishedAppBySubdomain(subdomain);
          if (publishedApp) {
            if (publishedApp.appStatus === "suspended") return serveSuspendedPage(res);
            publishedAppHeaders(res);
            return res.send(publishedApp.htmlContent);
          }
          return serveNotFoundPage(res);
        } catch (err) {
          console.error("Subdomain routing error:", err);
          return res.status(500).send("Internal server error");
        }
      }
    } else if (host !== baseDomain && host !== "localhost" && !host.includes("replit") && !host.includes("127.0.0.1")) {
      try {
        const publishedApp = await storage.getPublishedAppByCustomDomain(host);
        if (publishedApp) {
          if (publishedApp.appStatus === "suspended") return serveSuspendedPage(res);
          publishedAppHeaders(res);
          return res.send(publishedApp.htmlContent);
        }
      } catch (err) {
        console.error("Custom domain routing error:", err);
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
      const result = files.map((f) => {
        const entry: any = {
          filename: f.filename,
          originalName: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
          url: `/uploads/${f.filename}`,
        };
        if (f.mimetype.startsWith("image/")) {
          try {
            const imageBuffer = fs.readFileSync(f.path);
            entry.dataUrl = `data:${f.mimetype};base64,${imageBuffer.toString("base64")}`;
          } catch (e) {
            console.error("Error encoding image to base64:", e);
          }
        }
        return entry;
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: error.message || "Failed to upload file" });
    }
  });

  app.post("/api/analyze-image", isAuthenticated, async (req: any, res) => {
    try {
      const { imageBase64, mimeType, prompt } = req.body;

      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ message: "imageBase64 and mimeType are required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ message: "Image analysis service is not configured. Please contact support." });
      }

      const base64Size = Math.round((imageBase64.length * 3) / 4 / 1024);
      console.log(`[Gemini] Analyzing image: ${mimeType}, ~${base64Size}KB`);

      const analysis = await analyzeImage(imageBase64, mimeType, prompt || undefined);
      console.log(`[Gemini] Analysis complete: ${analysis.substring(0, 100)}...`);
      res.json({ analysis });
    } catch (error: any) {
      console.error("[Gemini] Analysis error:", error.message || error);
      res.status(500).json({ message: error.message || "Failed to analyze image. Please try again with a clearer photo." });
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

  app.post("/api/publish", publishLimiter, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { subdomain, htmlContent, title } = req.body;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendStep = (step: string, status: "pending" | "active" | "done" | "error", detail?: string) => {
      res.write(`data: ${JSON.stringify({ type: "step", step, status, detail })}\n\n`);
    };
    const sendResult = (data: any) => {
      res.write(`data: ${JSON.stringify({ type: "result", ...data })}\n\n`);
      res.end();
    };
    const sendError = (message: string) => {
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      res.end();
    };

    try {
      sendStep("validate", "active");
      if (!subdomain || !htmlContent || !title) {
        sendStep("validate", "error", "Missing required fields");
        return sendError("Subdomain, HTML content, and title are required");
      }
      const subdomainLower = subdomain.toLowerCase().trim();
      const validation = isValidSubdomain(subdomainLower);
      if (!validation.valid) {
        sendStep("validate", "error", validation.error);
        return sendError(validation.error!);
      }

      const scanResult = scanHtmlContent(htmlContent);
      if (scanResult.blocked) {
        sendStep("validate", "error", "Security check failed");
        return sendError(scanResult.reason || "Content contains potentially dangerous code patterns");
      }
      if (scanResult.warnings.length > 0) {
        const highWarnings = scanResult.warnings.filter(w => w.severity === "high");
        if (highWarnings.length > 0) {
          console.log(`Security warnings for ${subdomainLower}: ${highWarnings.map(w => w.name).join(", ")}`);
        }
      }

      sendStep("validate", "done", "Input validated");

      sendStep("check", "active");
      const existing = await storage.getPublishedAppBySubdomain(subdomainLower);
      if (existing && existing.userId !== userId) {
        sendStep("check", "error", "Subdomain taken");
        return sendError("This subdomain is already taken");
      }
      sendStep("check", "done", existing ? "Updating existing app" : "Subdomain available");

      sendStep("dns", "active");
      let dnsRecordId: string | undefined;
      if (existing && existing.userId === userId) {
        dnsRecordId = existing.cloudflareDnsRecordId || undefined;
        if (!dnsRecordId) {
          try {
            dnsRecordId = await createSubdomainRecord(subdomainLower);
          } catch (err) {
            console.error("Cloudflare DNS error:", err);
          }
        }
      } else {
        try {
          dnsRecordId = await createSubdomainRecord(subdomainLower);
        } catch (err) {
          console.error("Cloudflare DNS error:", err);
        }
      }
      sendStep("dns", "done", dnsRecordId ? "DNS record configured" : "DNS pending");

      sendStep("deploy", "active");
      let result;
      if (existing && existing.userId === userId) {
        await storage.createAppVersion(existing.id, existing.htmlContent, existing.title, "publish");
        await storage.deleteOldVersions(existing.id, 20);
        result = await storage.updatePublishedApp(existing.id, {
          htmlContent,
          title,
          cloudflareDnsRecordId: dnsRecordId || undefined,
        });
      } else {
        result = await storage.createPublishedApp({
          userId,
          subdomain: subdomainLower,
          htmlContent,
          title,
          cloudflareDnsRecordId: dnsRecordId || null,
        });
      }
      sendStep("deploy", "done", "App saved to database");

      sendStep("live", "active");
      const url = getPublishedUrl(subdomainLower);
      sendStep("live", "done", `Live at ${url}`);

      sendResult({ url, id: result.id, subdomain: subdomainLower });
    } catch (error: any) {
      console.error("Error publishing app:", error);
      sendError(error.message || "Failed to publish app");
    }
  });

  app.get("/api/published-apps/:id/versions", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id;
      const apps = await storage.getPublishedAppsByUser(userId);
      const app = apps.find(a => a.id === id);
      if (!app) return res.status(404).json({ error: "App not found or access denied" });
      const versions = await storage.getAppVersions(id);
      res.json(versions.map(v => ({
        id: v.id,
        versionNumber: v.versionNumber,
        title: v.title,
        snapshotReason: v.snapshotReason,
        createdAt: v.createdAt,
      })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/published-apps/:id/restore/:versionId", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const versionId = parseInt(req.params.versionId);
      const userId = req.user.id;
      const apps = await storage.getPublishedAppsByUser(userId);
      const app = apps.find(a => a.id === id);
      if (!app) return res.status(404).json({ error: "App not found or access denied" });
      const restored = await storage.restoreAppVersion(id, versionId);
      res.json({ success: true, app: restored });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

  app.get("/api/check-subdomain/:subdomain", async (req: any, res) => {
    try {
      const subdomain = req.params.subdomain.toLowerCase().trim();
      const validation = isValidSubdomain(subdomain);
      if (!validation.valid) {
        return res.json({ available: false, error: validation.error });
      }
      const existing = await storage.getPublishedAppBySubdomain(subdomain);
      if (!existing) {
        return res.json({ available: true });
      }
      const userId = req.user?.claims?.sub;
      if (userId && existing.userId === userId) {
        return res.json({ available: true, owned: true });
      }
      res.json({ available: false });
    } catch (error) {
      console.error("Error checking subdomain:", error);
      res.status(500).json({ available: false, error: "Failed to check subdomain" });
    }
  });

  app.post("/api/published-apps/:id/connect-domain", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const { domain } = req.body;

      if (!domain) return res.status(400).json({ message: "Domain is required" });

      const domainClean = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!/^[a-z0-9]([a-z0-9\-\.]*[a-z0-9])?$/.test(domainClean) || domainClean.length < 4) {
        return res.status(400).json({ message: "Invalid domain format" });
      }
      if (domainClean === "afroaigroup.com" || domainClean.endsWith(".afroaigroup.com")) {
        return res.status(400).json({ message: "Cannot use an afroaigroup.com domain here" });
      }

      const userApps = await storage.getPublishedAppsByUser(userId);
      const app = userApps.find((a) => a.id === id);
      if (!app || app.userId !== userId) {
        return res.status(404).json({ message: "App not found" });
      }

      const existing = await storage.getPublishedAppByCustomDomain(domainClean);
      if (existing && existing.id !== id) {
        return res.status(409).json({ message: "This domain is already connected to another app" });
      }

      await storage.updatePublishedApp(id, { customDomain: domainClean, customDomainVerified: false });
      res.json({ success: true, domain: domainClean, message: "Domain saved. Now verify it by adding a CNAME record." });
    } catch (error) {
      console.error("Error connecting domain:", error);
      res.status(500).json({ message: "Failed to connect domain" });
    }
  });

  app.post("/api/published-apps/:id/verify-domain", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;

      const userApps = await storage.getPublishedAppsByUser(userId);
      const app = userApps.find((a) => a.id === id);
      if (!app || app.userId !== userId) {
        return res.status(404).json({ message: "App not found" });
      }
      if (!app.customDomain) {
        return res.status(400).json({ message: "No custom domain set for this app" });
      }

      const dns = await import("dns");
      const { Resolver } = dns.promises;
      const resolver = new Resolver();
      const target = "afroaigroup.com";
      let verified = false;
      let dnsError = "";

      try {
        const cnames = await resolver.resolveCname(app.customDomain);
        verified = cnames.some((c) => c === target || c === `${target}.`);
        if (!verified) {
          const addresses = await resolver.resolve4(app.customDomain).catch(() => []);
          verified = addresses.length > 0;
          if (!verified) dnsError = `CNAME not pointing to ${target}. Found: ${cnames.join(", ")}`;
        }
      } catch (dnsErr: any) {
        dnsError = dnsErr.code === "ENODATA" || dnsErr.code === "ENOTFOUND"
          ? `No CNAME record found for ${app.customDomain}`
          : `DNS lookup failed: ${dnsErr.message}`;
      }

      if (verified) {
        await storage.updatePublishedApp(id, { customDomainVerified: true });
        return res.json({ success: true, verified: true, message: "Domain verified successfully!" });
      }
      res.json({ success: false, verified: false, message: dnsError || "Domain not verified yet. DNS may take up to 24 hours to propagate." });
    } catch (error) {
      console.error("Error verifying domain:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.delete("/api/published-apps/:id/custom-domain", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;

      const userApps = await storage.getPublishedAppsByUser(userId);
      const app = userApps.find((a) => a.id === id);
      if (!app || app.userId !== userId) {
        return res.status(404).json({ message: "App not found" });
      }

      await storage.updatePublishedApp(id, { customDomain: null as any, customDomainVerified: false });
      res.json({ success: true, message: "Custom domain removed" });
    } catch (error) {
      console.error("Error removing domain:", error);
      res.status(500).json({ message: "Failed to remove domain" });
    }
  });

  app.get("/api/forms", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userForms = await storage.getFormsByUser(userId);
      const formsWithCounts = await Promise.all(
        userForms.map(async (f) => ({
          ...f,
          submissionCount: await storage.getFormSubmissionCount(f.id),
        }))
      );
      res.json(formsWithCounts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  app.post("/api/forms", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { name, description, fields, submitButtonText, successMessage, notificationEmail } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "Form name is required" });
      const form = await storage.createForm({
        userId,
        name: name.trim(),
        description: description || null,
        fields: fields || [],
        submitButtonText: submitButtonText || "Submit",
        successMessage: successMessage || "Thank you! Your submission has been received.",
        notificationEmail: notificationEmail || null,
        isActive: true,
      });
      res.status(201).json(form);
    } catch (error) {
      res.status(500).json({ message: "Failed to create form" });
    }
  });

  app.get("/api/forms/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const form = await storage.getForm(id);
      if (!form || form.userId !== userId) return res.status(404).json({ message: "Form not found" });
      res.json(form);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch form" });
    }
  });

  app.put("/api/forms/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const form = await storage.getForm(id);
      if (!form || form.userId !== userId) return res.status(404).json({ message: "Form not found" });
      const { name, description, fields, submitButtonText, successMessage, notificationEmail, isActive } = req.body;
      const updated = await storage.updateForm(id, {
        name: name?.trim() || form.name,
        description: description ?? form.description,
        fields: fields ?? form.fields,
        submitButtonText: submitButtonText || form.submitButtonText,
        successMessage: successMessage || form.successMessage,
        notificationEmail: notificationEmail ?? form.notificationEmail,
        isActive: isActive ?? form.isActive,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update form" });
    }
  });

  app.delete("/api/forms/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const form = await storage.getForm(id);
      if (!form || form.userId !== userId) return res.status(404).json({ message: "Form not found" });
      await storage.deleteForm(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete form" });
    }
  });

  app.get("/api/forms/:id/submissions", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const form = await storage.getForm(id);
      if (!form || form.userId !== userId) return res.status(404).json({ message: "Form not found" });
      const submissions = await storage.getFormSubmissions(id);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  app.delete("/api/forms/:formId/submissions/:subId", isAuthenticated, async (req: any, res) => {
    try {
      const formId = parseInt(req.params.formId);
      const subId = parseInt(req.params.subId);
      const userId = req.user?.claims?.sub;
      const form = await storage.getForm(formId);
      if (!form || form.userId !== userId) return res.status(404).json({ message: "Form not found" });
      await storage.deleteFormSubmission(subId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete submission" });
    }
  });

  app.post("/api/forms/:id/submit", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const form = await storage.getForm(id);
      if (!form) return res.status(404).json({ message: "Form not found" });
      if (!form.isActive) return res.status(403).json({ message: "This form is not accepting submissions" });
      const submitterIp = req.ip || req.headers["x-forwarded-for"] as string || "";
      const submission = await storage.createFormSubmission({
        formId: id,
        data: req.body || {},
        submitterIp: submitterIp.toString().slice(0, 45),
      });
      res.json({ success: true, message: form.successMessage, submissionId: submission.id });
    } catch (error) {
      res.status(500).json({ message: "Failed to submit form" });
    }
  });

  app.get("/site/:subdomain", async (req, res) => {
    try {
      const subdomain = req.params.subdomain.toLowerCase().trim();
      const publishedApp = await storage.getPublishedAppBySubdomain(subdomain);
      if (!publishedApp) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html><head><title>Not Found</title>
          <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#d4af37;}
          .c{text-align:center;}h1{font-size:3rem;}p{color:#888;}</style></head>
          <body><div class="c"><h1>404</h1><p>This site doesn't exist yet.</p><a href="/" style="color:#d4af37;">Build one with Afro AI</a></div></body></html>
        `);
      }
      if (publishedApp.appStatus === "suspended") {
        return res.status(403).send(`<!DOCTYPE html>
          <html><head><title>Site Suspended</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;color:#fff;padding:20px;}
            .container{text-align:center;max-width:480px;}
            .icon{width:80px;height:80px;border-radius:50%;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;}
            .icon svg{width:40px;height:40px;color:#ef4444;}
            h1{font-size:1.75rem;font-weight:700;margin-bottom:12px;color:#ef4444;}
            p{color:#888;font-size:0.95rem;line-height:1.6;margin-bottom:8px;}
            .reason{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px 16px;margin:20px 0;font-size:0.85rem;color:#ccc;}
            a{color:#d4af37;text-decoration:none;font-weight:500;}
            a:hover{text-decoration:underline;}
            .footer{margin-top:32px;padding-top:20px;border-top:1px solid #222;font-size:0.8rem;color:#555;}
          </style></head>
          <body>
            <div class="container">
              <div class="icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg></div>
              <h1>Site Suspended</h1>
              <p>This website has been temporarily taken offline.</p>
              ${publishedApp.suspendReason ? `<div class="reason">${publishedApp.suspendReason}</div>` : ""}
              <p>If you are the owner of this site, please check your <a href="https://afroaigroup.com">Afro AI dashboard</a> for more details.</p>
              <div class="footer">Powered by <a href="https://afroaigroup.com">Afro AI</a></div>
            </div>
          </body></html>
        `);
      }
      publishedAppHeaders(res);
      // Record analytics view (fire and forget)
      storage.recordAppView(publishedApp.id).catch(() => {});
      res.send(publishedApp.htmlContent);
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

  app.post("/api/admin/published-apps/:id/suspend", isFounder, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;
      const updated = await storage.suspendPublishedApp(id, reason || "Suspended by administrator");
      res.json(updated);
    } catch (error) {
      console.error("Error suspending app:", error);
      res.status(500).json({ message: "Failed to suspend app" });
    }
  });

  app.post("/api/admin/published-apps/:id/reactivate", isFounder, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.reactivatePublishedApp(id);
      res.json(updated);
    } catch (error) {
      console.error("Error reactivating app:", error);
      res.status(500).json({ message: "Failed to reactivate app" });
    }
  });

  app.post("/api/admin/users/:userId/suspend-apps", isFounder, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      await storage.suspendAppsByUser(userId, reason || "Account suspension");
      res.json({ message: "All active apps suspended" });
    } catch (error) {
      console.error("Error suspending user apps:", error);
      res.status(500).json({ message: "Failed to suspend user apps" });
    }
  });

  app.post("/api/admin/users/:userId/reactivate-apps", isFounder, async (req: any, res) => {
    try {
      const { userId } = req.params;
      await storage.reactivateAppsByUser(userId);
      res.json({ message: "All suspended apps reactivated" });
    } catch (error) {
      console.error("Error reactivating user apps:", error);
      res.status(500).json({ message: "Failed to reactivate user apps" });
    }
  });

  app.get("/api/usage", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUsageStatsByUser(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage data" });
    }
  });

  app.get("/api/payments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userPayments = await storage.getPaymentsByUser(userId);
      res.json(userPayments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get("/api/payments/:id/receipt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const paymentId = parseInt(req.params.id);
      const payment = await storage.getPaymentById(paymentId);

      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }
      if (payment.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const user = await storage.getUser(userId);

      res.json({
        receipt: {
          id: payment.id,
          date: payment.createdAt,
          plan: payment.plan,
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          confirmationCode: payment.confirmationCode,
          status: payment.status,
          merchantReference: payment.merchantReference,
          customerName: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "Customer",
          customerEmail: user?.email || "",
          business: "KEYO TECHNOLOGIES",
          registrationNo: "80030812159711",
          platform: "Afro AI (afroaigroup.com)",
        },
      });
    } catch (error) {
      console.error("Error fetching receipt:", error);
      res.status(500).json({ message: "Failed to fetch receipt" });
    }
  });

  let cachedIpnId: string | null = null;

  const PLAN_PRICES_USD: Record<string, number> = { pro: 9, business: 29 };

  app.post("/api/subscribe", apiLimiter, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { plan, countryCode, firstName, lastName, phoneNumber } = req.body;

      if (!plan) {
        return res.status(400).json({ message: "Plan is required" });
      }

      const validPlans = ["pro", "business"];
      if (!validPlans.includes(plan)) {
        return res.status(400).json({ message: "Invalid plan. Must be 'pro' or 'business'" });
      }

      const userEmail = req.user.claims.email || req.user.claims.preferred_username;
      if (!userEmail) {
        return res.status(400).json({ message: "User email not available" });
      }

      const usdAmount = PLAN_PRICES_USD[plan];
      let currency = "USD";
      let amount = usdAmount;

      if (countryCode) {
        const { getCurrencyForCountry, convertUsdToLocal } = await import("@shared/currencies");
        const currencyInfo = getCurrencyForCountry(countryCode);
        if (currencyInfo) {
          currency = currencyInfo.currencyCode;
          amount = Math.round(convertUsdToLocal(usdAmount, countryCode));
        }
      }

      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

      if (!cachedIpnId) {
        try {
          cachedIpnId = await registerIpnUrl(`${baseUrl}/api/pesapal/ipn`);
        } catch (err) {
          console.error("Failed to register IPN URL:", err);
          return res.status(500).json({ message: "Payment service configuration error" });
        }
      }

      const merchantReference = `${plan}-${userId}-${crypto.randomBytes(4).toString("hex")}`;

      const order = await submitOrder({
        id: merchantReference,
        currency,
        amount,
        description: `Afro AI ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Subscription`,
        callback_url: `${baseUrl}/api/pesapal/callback`,
        notification_id: cachedIpnId,
        billing_address: {
          email_address: userEmail,
          phone_number: phoneNumber || undefined,
          country_code: countryCode || undefined,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
        },
      });

      await storage.createPayment({
        userId,
        plan,
        amount: amount.toString(),
        currency,
        pesapalTrackingId: order.order_tracking_id,
        merchantReference,
        status: "pending",
      });

      res.json({
        redirectUrl: order.redirect_url,
        orderTrackingId: order.order_tracking_id,
        merchantReference: order.merchant_reference,
      });
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: error.message || "Failed to create subscription" });
    }
  });

  async function processCompletedPayment(merchantRef: string, status: any) {
    const existingPayment = await storage.getPaymentByMerchantRef(merchantRef);
    if (!existingPayment) {
      console.error(`No payment record found for merchantRef: ${merchantRef}`);
      return false;
    }

    if (existingPayment.status === "completed") {
      console.log(`Payment ${merchantRef} already processed, skipping`);
      return true;
    }

    if (status.merchant_reference && status.merchant_reference !== merchantRef) {
      console.error(`Merchant reference mismatch: expected ${merchantRef}, got ${status.merchant_reference}`);
      return false;
    }

    await storage.updatePaymentByMerchantRef(merchantRef, {
      status: "completed",
      paymentMethod: status.payment_method || undefined,
      confirmationCode: status.confirmation_code || undefined,
    });

    const userId = existingPayment.userId;
    const plan = existingPayment.plan;

    await storage.updateUserPlan(userId, plan);
    await storage.reactivateAppsByUser(userId);
    console.log(`User ${userId} upgraded to ${plan} plan — apps reactivated`);

    try {
      const user = await storage.getUser(userId);
      if (user?.referredBy) {
        const referrer = await storage.getUserByReferralCode(user.referredBy);
        if (referrer) {
          const commission = Math.round(status.amount * 0.1);
          await storage.updateReferralStatus(userId, "paid", commission, plan);
          await storage.addReferralCredit(referrer.id, commission);
        }
      }
    } catch (refErr) {
      console.error("Error processing referral commission:", refErr);
    }

    return true;
  }

  app.get("/api/pesapal/ipn", async (req, res) => {
    try {
      const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.query;

      if (!OrderTrackingId || !OrderMerchantReference) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      const trackingId = OrderTrackingId as string;
      const merchantRef = OrderMerchantReference as string;

      console.log(`IPN received: trackingId=${trackingId}, merchantRef=${merchantRef}, type=${OrderNotificationType}`);

      const status = await getTransactionStatus(trackingId);

      if (isPaymentComplete(status)) {
        await processCompletedPayment(merchantRef, status);
      } else if (isPaymentFailed(status)) {
        const existingPayment = await storage.getPaymentByMerchantRef(merchantRef);
        if (existingPayment && existingPayment.status === "pending") {
          await storage.updatePaymentByMerchantRef(merchantRef, { status: "failed" });
        }
        console.log(`Payment failed for ${merchantRef}: ${status.payment_status_description}`);
      }

      res.json({ orderNotificationType: OrderNotificationType, orderTrackingId: trackingId, orderMerchantReference: merchantRef, status: 200 });
    } catch (error: any) {
      console.error("Error processing IPN:", error);
      res.status(500).json({ message: error.message || "Failed to process IPN" });
    }
  });

  app.get("/api/pesapal/callback", async (req, res) => {
    try {
      const { OrderTrackingId, OrderMerchantReference } = req.query;

      if (!OrderTrackingId) {
        return res.redirect("/?payment=error&reason=missing_tracking_id");
      }

      const trackingId = OrderTrackingId as string;
      const merchantRef = (OrderMerchantReference as string) || "";

      const status = await getTransactionStatus(trackingId);

      if (isPaymentComplete(status)) {
        await processCompletedPayment(merchantRef, status);
        const payment = await storage.getPaymentByMerchantRef(merchantRef);
        return res.redirect(`/?payment=success&plan=${encodeURIComponent(payment?.plan || "pro")}`);
      } else if (isPaymentFailed(status)) {
        const existingPayment = await storage.getPaymentByMerchantRef(merchantRef);
        if (existingPayment && existingPayment.status === "pending") {
          await storage.updatePaymentByMerchantRef(merchantRef, { status: "failed" });
        }
        return res.redirect(`/?payment=failed&reason=${encodeURIComponent(status.payment_status_description || "Payment failed")}`);
      } else {
        return res.redirect(`/?payment=pending&trackingId=${encodeURIComponent(trackingId)}`);
      }
    } catch (error: any) {
      console.error("Error handling payment callback:", error);
      return res.redirect(`/?payment=error&reason=${encodeURIComponent(error.message || "Unknown error")}`);
    }
  });

  // ============ BLOG / CMS ROUTES ============
  app.get("/api/blog", isAuthenticated, async (req: any, res) => {
    try {
      const posts = await storage.getBlogPostsByUser(req.user.id);
      res.json(posts);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/blog", isAuthenticated, async (req: any, res) => {
    try {
      const { title, content, excerpt, coverImage, status } = req.body;
      if (!title) return res.status(400).json({ message: "Title is required" });
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
      const post = await storage.createBlogPost({
        userId: req.user.id, title, slug, content: content || "", excerpt: excerpt || null,
        coverImage: coverImage || null, status: status || "draft",
        publishedAt: status === "published" ? new Date() : null,
      });
      res.json(post);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/blog/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getBlogPost(id);
      if (!post || post.userId !== req.user.id) return res.status(404).json({ message: "Post not found" });
      const { title, content, excerpt, coverImage, status } = req.body;
      const updated = await storage.updateBlogPost(id, {
        title, content, excerpt, coverImage, status,
        publishedAt: status === "published" && !post.publishedAt ? new Date() : post.publishedAt,
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/blog/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getBlogPost(id);
      if (!post || post.userId !== req.user.id) return res.status(404).json({ message: "Post not found" });
      await storage.deleteBlogPost(id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ EMAIL SUBSCRIBERS ROUTES ============
  app.get("/api/email/subscribers", isAuthenticated, async (req: any, res) => {
    try {
      const subs = await storage.getEmailSubscribersByUser(req.user.id);
      res.json(subs);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/email/subscribers", isAuthenticated, async (req: any, res) => {
    try {
      const { email, name, tags } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const sub = await storage.addEmailSubscriber({ userId: req.user.id, email, name: name || null, status: "active", tags: tags || [] });
      res.json(sub);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/email/subscribers/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      await storage.updateEmailSubscriberStatus(parseInt(req.params.id), req.body.status);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/email/subscribers/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteEmailSubscriber(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ EMAIL CAMPAIGNS ROUTES ============
  app.get("/api/email/campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const campaigns = await storage.getEmailCampaignsByUser(req.user.id);
      res.json(campaigns);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/email/campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const { name, subject, htmlContent } = req.body;
      if (!name || !subject) return res.status(400).json({ message: "Name and subject are required" });
      const campaign = await storage.createEmailCampaign({ userId: req.user.id, name, subject, htmlContent: htmlContent || "", status: "draft", recipientCount: 0 });
      res.json(campaign);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/email/campaigns/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const campaign = await storage.getEmailCampaign(id);
      if (!campaign || campaign.userId !== req.user.id) return res.status(404).json({ message: "Campaign not found" });
      const updated = await storage.updateEmailCampaign(id, req.body);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/email/campaigns/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const campaign = await storage.getEmailCampaign(id);
      if (!campaign || campaign.userId !== req.user.id) return res.status(404).json({ message: "Campaign not found" });
      await storage.deleteEmailCampaign(id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ ANALYTICS ============
  app.get("/api/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const data = await storage.getAppViewsByUser(userId);
      res.json(data);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/analytics/:appId", isAuthenticated, async (req: any, res) => {
    try {
      const stats = await storage.getAppViewStats(parseInt(req.params.appId));
      res.json(stats);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ MARKETPLACE ============
  app.get("/api/marketplace", async (req: any, res) => {
    try {
      const { category, search } = req.query;
      const listings = await storage.getMarketplaceListings(category as string, search as string);
      res.json(listings);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/marketplace/mine", isAuthenticated, async (req: any, res) => {
    try {
      const listings = await storage.getMarketplaceListingsByUser(req.user.id);
      res.json(listings);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/marketplace/:id", async (req: any, res) => {
    try {
      const listing = await storage.getMarketplaceListing(parseInt(req.params.id));
      if (!listing) return res.status(404).json({ message: "Not found" });
      res.json(listing);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/marketplace", isAuthenticated, async (req: any, res) => {
    try {
      const listing = await storage.createMarketplaceListing({ ...req.body, userId: req.user.id });
      res.json(listing);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/marketplace/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getMarketplaceListing(id);
      if (!existing || existing.userId !== req.user.id) return res.status(403).json({ message: "Not authorized" });
      const updated = await storage.updateMarketplaceListing(id, req.body);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/marketplace/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getMarketplaceListing(id);
      if (!existing || existing.userId !== req.user.id) return res.status(403).json({ message: "Not authorized" });
      await storage.deleteMarketplaceListing(id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/marketplace/:id/clone", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const listing = await storage.getMarketplaceListing(id);
      if (!listing) return res.status(404).json({ message: "Not found" });
      await storage.incrementListingDownloads(id);
      res.json({ htmlContent: listing.htmlContent, title: listing.title });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ COLLABORATION ============
  app.get("/api/collaborate/project/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== req.user.id) return res.status(403).json({ message: "Not authorized" });
      const collaborators = await storage.getCollaboratorsByProject(projectId);
      res.json(collaborators);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/collaborate/shared", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const email = user.email || user.claims?.email || "";
      const shared = await storage.getSharedProjectsByEmail(email);
      res.json(shared);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/collaborate/invite", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, inviteEmail, role } = req.body;
      const project = await storage.getProject(parseInt(projectId));
      if (!project || project.userId !== req.user.id) return res.status(403).json({ message: "Not authorized" });
      const collaborator = await storage.addCollaborator({ projectId: parseInt(projectId), inviteEmail, role: role || "viewer", status: "pending" });
      res.json(collaborator);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/collaborate/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.removeCollaborator(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ DOMAIN RESELLER (name.com) ============
  app.post("/api/domains/check", isAuthenticated, async (req: any, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ message: "Search query required" });
      const results = await checkDomainAvailability(query.trim());
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/domains/check-single", isAuthenticated, async (req: any, res) => {
    try {
      const { domainName } = req.body;
      if (!domainName) return res.status(400).json({ message: "Domain name required" });
      const result = await checkSingleDomain(domainName.trim().toLowerCase());
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/domains/my", isAuthenticated, async (req: any, res) => {
    try {
      const orders = await storage.getDomainOrdersByUser(req.user.id);
      res.json(orders);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/domains/order", isAuthenticated, async (req: any, res) => {
    try {
      const { domainName, years, contact } = req.body;
      if (!domainName || !contact) return res.status(400).json({ message: "Domain name and contact info required" });

      // Get cost price
      const costPrice = await getCostPrice(domainName);
      if (!costPrice) return res.status(400).json({ message: "Domain not available or could not get price" });

      const MARKUP = 0.35;
      const retailPrice = parseFloat((costPrice * (1 + MARKUP)).toFixed(2));
      const priceCents = Math.round(retailPrice * 100);
      const costCents = Math.round(costPrice * 100);

      // Create pending order
      const order = await storage.createDomainOrder({
        userId: req.user.id,
        domainName,
        status: "pending_payment",
        pricePaid: priceCents,
        costPrice: costCents,
        years: years || 1,
        contactFirstName: contact.firstName,
        contactLastName: contact.lastName,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        contactAddress: contact.address,
        contactCity: contact.city,
        contactState: contact.state,
        contactZip: contact.zip,
        contactCountry: contact.country || "UG",
      });

      // Create Pesapal payment
      try {
        const baseUrl = `https://${req.headers.host}`;
        const ipnId = await registerIpnUrl(`${baseUrl}/api/pesapal/ipn`);
        const pesapalResp = await submitOrder({
          id: `domain-${order.id}`,
          amount: retailPrice,
          currency: "USD",
          description: `Domain registration: ${domainName} (${years || 1} year)`,
          callbackUrl: `${baseUrl}/domains?order=${order.id}&status=success`,
          ipnId,
          email: contact.email || req.user.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
        });

        if (pesapalResp.redirect_url) {
          await storage.updateDomainOrder(order.id, { pesapalOrderId: pesapalResp.order_tracking_id });
          return res.json({ orderId: order.id, paymentUrl: pesapalResp.redirect_url, amount: retailPrice });
        }
      } catch (payErr) {
        console.error("Pesapal error:", payErr);
      }

      res.json({ orderId: order.id, amount: retailPrice, message: "Order created, payment pending" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/domains/activate/:orderId", isAuthenticated, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const order = await storage.getDomainOrder(orderId);
      if (!order || order.userId !== req.user.id) return res.status(403).json({ message: "Not authorized" });
      if (order.status === "active") return res.json({ message: "Already active", order });

      const contact = {
        firstName: order.contactFirstName || "Admin",
        lastName: order.contactLastName || "Admin",
        email: order.contactEmail || req.user.email,
        phone: order.contactPhone || "+256700000000",
        address1: order.contactAddress || "Kampala",
        city: order.contactCity || "Kampala",
        state: order.contactState || "Central",
        zip: order.contactZip || "00000",
        country: order.contactCountry || "UG",
      };

      const costPriceDollars = order.costPrice / 100;
      const result = await registerDomain(order.domainName, contact, costPriceDollars, order.years);
      const expiryDate = result.domain?.expireDate || result.expireDate || "";
      const nameservers = result.domain?.nameservers || result.nameservers || [];
      const updated = await storage.updateDomainOrder(orderId, {
        status: "active",
        namecomOrderId: String(result.order?.orderId || result.orderId || ""),
        expiryDate,
        nameservers,
      });
      res.json({ success: true, order: updated });
    } catch (e: any) {
      await storage.updateDomainOrder(parseInt(req.params.orderId), { status: "failed" }).catch(() => {});
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/domains/info/:domainName", isAuthenticated, async (req: any, res) => {
    try {
      const info = await getDomainInfo(req.params.domainName);
      res.json(info);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/domains/nameservers/:orderId", isAuthenticated, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const order = await storage.getDomainOrder(orderId);
      if (!order || order.userId !== req.user.id) return res.status(403).json({ message: "Not authorized" });
      const { nameservers } = req.body;
      await setNameservers(order.domainName, nameservers);
      await storage.updateDomainOrder(orderId, { nameservers });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ PWA GENERATOR ============
  app.post("/api/pwa/generate", isAuthenticated, async (req: any, res) => {
    try {
      const { publishedAppId } = req.body;
      const app = await storage.getPublishedAppById(parseInt(publishedAppId));
      if (!app || app.userId !== req.user.id) return res.status(403).json({ message: "Not authorized" });
      const appName = app.appName || "My App";
      const slug = app.subdomain;
      const manifest = {
        name: appName,
        short_name: appName.substring(0, 12),
        start_url: `/site/${slug}`,
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: "#d4af37",
        description: `${appName} - Built with Afro AI`,
        icons: [
          { src: "https://afroaigroup.com/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "https://afroaigroup.com/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      };
      const serviceWorker = `const CACHE_NAME='afroai-pwa-v1';const URLS=['./'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(URLS))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`;
      const pwaSnippet = `<link rel="manifest" href="/manifest.json">\n<meta name="theme-color" content="#d4af37">\n<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}</script>`;
      res.json({ manifest, serviceWorker, pwaSnippet, appName });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  return httpServer;
}
