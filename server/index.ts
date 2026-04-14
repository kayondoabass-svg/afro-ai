import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { securityHeaders } from "./security";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

app.use(compression());
app.use(securityHeaders);

// CORS — allow the Replit origin, Cloudflare Pages domains, and any custom frontend URL
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://afroaigroup.com",
    "https://www.afroaigroup.com",
    ...(process.env.CLOUDFLARE_PAGES_URL ? [process.env.CLOUDFLARE_PAGES_URL] : []),
  ];
  const origin = req.headers.origin || "";
  const isAllowed =
    allowedOrigins.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.afroaigroup\.com$/.test(origin) ||
    origin.endsWith(".replit.dev") ||
    origin.endsWith(".repl.co");
  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.get("/_health", (_req, res) => {
  res.status(200).send("ok");
});

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
    reusePort: true,
  },
  () => {
    log(`serving on port ${port}`);
  },
);

(async () => {
  await registerRoutes(httpServer, app);

  // Verify Pesapal credentials on startup
  try {
    const { getAuthToken } = await import("./pesapal");
    await getAuthToken();
    console.log("[Pesapal] ✓ Credentials verified successfully");
  } catch (e: any) {
    console.error("[Pesapal] ✗ Credential check failed:", e.message);
  }

  // Run free-plan expiry check on startup and every 6 hours
  const runExpiryCheck = async () => {
    try {
      const count = await storage.suspendExpiredFreeApps();
      if (count > 0) console.log(`[scheduler] Suspended ${count} expired free-plan app(s).`);
    } catch (e) {
      console.error("[scheduler] Expiry check failed:", e);
    }
  };
  runExpiryCheck();
  setInterval(runExpiryCheck, 6 * 60 * 60 * 1000);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
})();
