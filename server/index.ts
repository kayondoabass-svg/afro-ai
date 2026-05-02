import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { securityHeaders } from "./security";
import { storage } from "./storage";

const app = express();

// Required so `req.hostname` reflects the original Host header / X-Forwarded-Host
// when Express is behind Cloudflare (or any other reverse proxy). Without this,
// Express only sees the upstream proxy's Host and the www-detection below would
// silently no-op in production.
app.set("trust proxy", true);

// ── www → apex 301 redirect ──────────────────────────────────────────────────
// Mobile browsers, DNS auto-completion, and various CDN canonicalisation rules
// can send a user to `www.afroaigroup.com` instead of the canonical apex
// `afroaigroup.com`. Even though our session cookie is now scoped to the whole
// domain, having two valid hosts causes secondary problems (duplicate cookies
// from older sessions, OAuth callback URL mismatches, SEO duplicate-content
// signals). Force everyone to apex at the very edge of the request pipeline so
// downstream middleware never has to think about it. This runs BEFORE any other
// middleware so we don't waste cycles setting security headers / CORS / etc on
// what's about to be a 301.
app.use((req, res, next) => {
  if (req.hostname === "www.afroaigroup.com") {
    return res.redirect(301, `https://afroaigroup.com${req.originalUrl}`);
  }
  next();
});

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

// ── Friendly holding page while server is still booting ──────────────────────
// Express starts listening on the port BEFORE registerRoutes() finishes (the
// async block below). Any request that lands during that 1-3s window — or
// during a deploy restart — would otherwise hit Express's default
// "Cannot GET /" 404 page. Serve a calm branded page instead.
let routesReady = false;
export function markRoutesReady() { routesReady = true; }

const HOLDING_PAGE = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Afro AI — Updating</title>
<meta http-equiv="refresh" content="4"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#0f0a1f 0%,#1a0f2e 100%);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center}
  .logo{font-size:32px;font-weight:800;background:linear-gradient(90deg,#a78bfa,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
  .tag{font-size:13px;color:#a1a1aa;letter-spacing:.3px;margin-bottom:32px}
  .spinner{width:48px;height:48px;border:3px solid rgba(167,139,250,.2);border-top-color:#a78bfa;border-radius:50%;margin:0 auto 24px;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  h1{font-size:22px;font-weight:600;margin-bottom:12px}
  p{color:#a1a1aa;font-size:15px;line-height:1.5;margin-bottom:24px}
  .hint{font-size:12px;color:#71717a}
</style></head><body><div class="card">
<div class="logo">Afro AI</div>
<div class="tag">Made in Africa, built for everyone</div>
<div class="spinner"></div>
<h1>We're updating, back in a moment</h1>
<p>This usually takes 10–30 seconds. The page will reload by itself.</p>
<div class="hint">Tubaako mu kaseera ntono • Tutarudi punde • Nous revenons bientôt</div>
</div></body></html>`;

app.use((req, res, next) => {
  if (routesReady) return next();
  // Let health checks and static asset probes pass through untouched
  if (req.path === "/_health") return next();
  // For API calls, return JSON so the frontend can show a friendly toast
  if (req.path.startsWith("/api")) {
    return res.status(503).json({ message: "Afro AI is updating, please try again in a few seconds." });
  }
  res.status(503).set("Retry-After", "5").send(HOLDING_PAGE);
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
  markRoutesReady();
  log("✓ Routes ready — accepting traffic");

  // Start daily cleanup job that trims old chatbot conversations per plan retention
  const { startChatbotRetentionJob } = await import("./chatbot-retention");
  startChatbotRetentionJob();
  const { startChatbotAutoScanScheduler } = await import("./chatbot-autoscan-scheduler");
  startChatbotAutoScanScheduler();

  // ─── Sandboxed Interactive Shell via Socket.io + node-pty ───────────────────
  // Strategy: Docker first (afro-terminal-box image), ulimit/nice fallback.
  //
  // Docker mode (when daemon is available):
  //   docker run --rm -it --name shell-<id>
  //     --memory="256m" --cpus=".5"
  //     --network=none --read-only --tmpfs /home/afro-user --tmpfs /tmp
  //     afro-terminal-box
  //
  // Fallback mode (no Docker daemon):
  //   nice -n 15 bash -c "ulimit -v 262144 -u 60 -n 64 -f 102400 && exec bash"
  //   + isolated /tmp/shell-<uuid> HOME directory
  //
  // Both modes: 30-min idle timeout, max 5 concurrent sessions, cleanup on exit.
  // ─────────────────────────────────────────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    path: "/shell-ws",
    cors: { origin: "*", credentials: true },
  });

  const { randomUUID } = await import("crypto");
  const { existsSync, rmSync, mkdirSync } = await import("fs");
  const { execSync } = await import("child_process");

  // ── Build Docker image on startup ──────────────────────────────────────────
  const DOCKER_IMAGE = "afro-terminal-box";
  let dockerAvailable = false;

  try {
    execSync("docker info", { timeout: 5000, stdio: "ignore" });
    log(`[Shell] Docker daemon detected — building ${DOCKER_IMAGE} image...`, "shell");
    execSync(
      `docker build -t ${DOCKER_IMAGE} -f Dockerfile.shell .`,
      { cwd: process.cwd(), timeout: 120_000, stdio: "pipe" }
    );
    dockerAvailable = true;
    log(`[Shell] ✓ Docker image '${DOCKER_IMAGE}' ready`, "shell");
  } catch {
    log("[Shell] Docker daemon not available — using process isolation fallback", "shell");
  }

  let activeSessions = 0;
  const MAX_SESSIONS = 5;
  const SESSION_IDLE_MS = 30 * 60 * 1000;       // 30 minutes idle
  const SESSION_HARD_MAX_MS = 60 * 60 * 1000;   // 60 minutes wall-clock cap

  // ── Hard-fail if SHELL_SECRET is missing or weak ──────────────────────────
  // The shell endpoint runs commands as the host process. Without a strong
  // secret, anyone who finds /shell-ws can take over the box.
  const SHELL_SECRET = process.env.SHELL_SECRET || "";
  const SHELL_ENABLED = SHELL_SECRET.length >= 32;
  if (!SHELL_ENABLED) {
    log(
      "[Shell] DISABLED — SHELL_SECRET env var is missing or shorter than 32 chars. " +
      "Set a strong random value (e.g. `openssl rand -hex 32`) to enable the admin shell.",
      "shell"
    );
  } else {
    log("[Shell] Admin shell enabled (gated by SHELL_SECRET)", "shell");
  }

  io.on("connection", (socket) => {
    if (!SHELL_ENABLED) {
      socket.emit("output", "\r\n\x1b[31m[Afro AI Shell] Disabled by server config.\x1b[0m\r\n");
      socket.disconnect(true);
      return;
    }

    const adminKey = socket.handshake.auth?.adminKey;
    if (typeof adminKey !== "string" || adminKey.length !== SHELL_SECRET.length || adminKey !== SHELL_SECRET) {
      socket.emit("output", "\r\n\x1b[31m[Afro AI Shell] Access denied. Invalid admin key.\x1b[0m\r\n");
      socket.disconnect(true);
      return;
    }

    if (activeSessions >= MAX_SESSIONS) {
      socket.emit("output", "\r\n\x1b[33m[Afro AI Shell] Max concurrent sessions reached. Try again shortly.\x1b[0m\r\n");
      socket.disconnect(true);
      return;
    }

    activeSessions++;
    const sessionId = randomUUID().slice(0, 8);
    const containerName = `afroai-shell-${sessionId}`;
    const sessionDir = `/tmp/shell-${sessionId}`;
    let ptyProcess: any = null;
    let idleTimer: NodeJS.Timeout | null = null;
    let hardTimer: NodeJS.Timeout | null = null;
    log(`[Shell] Session ${sessionId} started (active=${activeSessions})`, "shell");

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (hardTimer) clearTimeout(hardTimer);
      try { ptyProcess?.kill("SIGKILL"); } catch (_) {}
      // Remove Docker container if it is still running
      if (dockerAvailable) {
        try { execSync(`docker rm -f ${containerName}`, { stdio: "ignore", timeout: 5000 }); } catch (_) {}
      }
      // Remove isolated session directory (fallback mode)
      try { if (existsSync(sessionDir)) rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
      activeSessions = Math.max(0, activeSessions - 1);
    };

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        socket.emit("output", "\r\n\x1b[33m[Session auto-closed: 30 minutes of inactivity]\x1b[0m\r\n");
        cleanup();
        socket.disconnect(true);
      }, SESSION_IDLE_MS);
    };

    // Wall-clock cap: kill any session that runs longer than 60 minutes
    // regardless of activity. Stops runaway loops from hogging the box.
    hardTimer = setTimeout(() => {
      socket.emit("output", "\r\n\x1b[33m[Session auto-closed: 60 minute hard limit reached]\x1b[0m\r\n");
      cleanup();
      socket.disconnect(true);
    }, SESSION_HARD_MAX_MS);

    try {
      const pty = require("node-pty");

      if (dockerAvailable) {
        // ── Docker container session ────────────────────────────────────────
        // Each user gets an isolated alpine container:
        //   --memory="256m"    hard RAM cap
        //   --cpus=".5"        half a CPU core
        //   --network=none     no internet access from inside the box
        //   --read-only        immutable root filesystem
        //   --tmpfs            writable scratch space only in /home and /tmp
        ptyProcess = pty.spawn("docker", [
          "run", "--rm", "-it",
          `--name`, containerName,
          "--memory=256m",
          "--cpus=.5",
          "--network=none",
          "--read-only",
          "--tmpfs", "/home/afro-user:rw,noexec,nosuid,size=64m",
          "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
          DOCKER_IMAGE,
        ], {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          env: { TERM: "xterm-256color" },
        });

        socket.emit("output", [
          "\r\n\x1b[32m╔══════════════════════════════════════════════╗",
          "║   Afro AI Shell  •  Docker Container         ║",
          `║   Image: ${DOCKER_IMAGE.padEnd(36)}║`,
          "║   RAM: 256 MB  •  CPU: 0.5 cores             ║",
          "║   Network: isolated  •  FS: read-only        ║",
          "║   Auto-closes after 30 min idle              ║",
          "║   Type 'exit' to end session                 ║",
          "╚══════════════════════════════════════════════╝\x1b[0m\r\n\r\n",
        ].join("\r\n"));

      } else {
        // ── Fallback: Linux process isolation ───────────────────────────────
        mkdirSync(sessionDir, { recursive: true });

        const initCmd = [
          `ulimit -v 262144 -u 60 -n 64 -f 102400 2>/dev/null`,
          `export HOME="${sessionDir}" TMPDIR="${sessionDir}"`,
          `export PS1='\\[\\033[1;32m\\]afroai\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\$ '`,
          `export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`,
          `cd "${sessionDir}"`,
          `exec bash --norc --noprofile`,
        ].join(" && ");

        ptyProcess = pty.spawn("nice", ["-n", "15", "bash", "--norc", "-c", initCmd], {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          cwd: sessionDir,
          env: {
            TERM: "xterm-256color",
            SHELL: "/bin/bash",
            HOME: sessionDir,
            TMPDIR: sessionDir,
            AFRO_SESSION: sessionId,
            PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            LANG: "en_US.UTF-8",
          },
        });

        socket.emit("output", [
          "\r\n\x1b[33m╔══════════════════════════════════════════════╗",
          "║   Afro AI Shell  •  ADMIN MODE (limited)     ║",
          "║   RAM: 256 MB cap  •  Procs: 60 max          ║",
          "║   Files: 100 MB max  •  FDs: 64              ║",
          "║   Isolated $HOME at /tmp/shell-<id>          ║",
          "║                                              ║",
          "║   ⚠  No kernel-level isolation on this host  ║",
          "║      Do NOT expose this to untrusted users.  ║",
          "║                                              ║",
          "║   Idle: 30 min  •  Hard cap: 60 min          ║",
          "║   Type 'exit' to end session                 ║",
          "╚══════════════════════════════════════════════╝\x1b[0m\r\n\r\n",
        ].join("\r\n"));
      }

      resetIdle();

      ptyProcess.onData((data: string) => socket.emit("output", data));

      socket.on("input", (data: string) => {
        resetIdle();
        try { ptyProcess?.write(data); } catch (_) {}
      });

      socket.on("resize", ({ cols, rows }: { cols: number; rows: number }) => {
        try { ptyProcess?.resize(cols, rows); } catch (_) {}
      });

      socket.on("disconnect", () => cleanup());

      ptyProcess.onExit(() => {
        socket.emit("output", "\r\n\x1b[33m[Shell session ended]\x1b[0m\r\n");
        cleanup();
        socket.disconnect(true);
      });

    } catch (e: any) {
      cleanup();
      socket.emit("output", `\r\n\x1b[31m[Error] Failed to start shell: ${e.message}\x1b[0m\r\n`);
      socket.disconnect(true);
    }
  });


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
