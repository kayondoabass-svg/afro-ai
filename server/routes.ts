import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated, isFounder } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { storage } from "./storage";
import { insertProjectSchema } from "@shared/schema";
import { createSubdomainRecord, deleteSubdomainRecord, isValidSubdomain, getPublishedUrl } from "./cloudflare";
import { registerIpnUrl, submitOrder, getTransactionStatus, isPaymentComplete, isPaymentFailed } from "./pesapal";
import { analyzeImage } from "./gemini";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import crypto from "crypto";

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
        return res.status(403).send(`
          <!DOCTYPE html>
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

  let cachedIpnId: string | null = null;

  const PLAN_PRICES_USD: Record<string, number> = { pro: 9, business: 29 };

  app.post("/api/subscribe", isAuthenticated, async (req: any, res) => {
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
        const parts = merchantRef.split("-");
        if (parts.length >= 2) {
          const plan = parts[0];
          const userId = parts.slice(1, -1).join("-");
          await storage.updateUserPlan(userId, plan);
          await storage.reactivateAppsByUser(userId);
          console.log(`User ${userId} upgraded to ${plan} plan via IPN — apps reactivated`);

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
        }
      } else if (isPaymentFailed(status)) {
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
        const parts = merchantRef.split("-");
        if (parts.length >= 2) {
          const plan = parts[0];
          const userId = parts.slice(1, -1).join("-");
          await storage.updateUserPlan(userId, plan);
          console.log(`User ${userId} upgraded to ${plan} plan via callback`);
        }
        return res.redirect(`/?payment=success&plan=${encodeURIComponent(parts[0] || "pro")}`);
      } else if (isPaymentFailed(status)) {
        return res.redirect(`/?payment=failed&reason=${encodeURIComponent(status.payment_status_description || "Payment failed")}`);
      } else {
        return res.redirect(`/?payment=pending&trackingId=${encodeURIComponent(trackingId)}`);
      }
    } catch (error: any) {
      console.error("Error handling payment callback:", error);
      return res.redirect(`/?payment=error&reason=${encodeURIComponent(error.message || "Unknown error")}`);
    }
  });

  return httpServer;
}
