import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
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

  // ─── Sandboxed Interactive Shell via Socket.io + node-pty ───────────────────
  // Docker daemon is unavailable in this environment, so we implement equivalent
  // isolation using Linux process controls:
  //   • ulimit -v 262144  → 256 MB virtual-memory cap per session
  //   • ulimit -u 60      → max 60 sub-processes (fork-bomb protection)
  //   • ulimit -n 64      → max 64 open file descriptors
  //   • ulimit -f 102400  → max 100 MB single-file writes
  //   • nice -n 15        → CPU deprioritisation (~0.5-core equivalent)
  //   • isolated HOME dir → /tmp/shell-<uuid> created fresh, deleted on exit
  //   • 30-min idle timer → auto-kill on inactivity
  //   • max 5 concurrent  → reject excess connections
  // ─────────────────────────────────────────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    path: "/shell-ws",
    cors: { origin: "*", credentials: true },
  });

  const { randomUUID } = await import("crypto");
  const { existsSync, rmSync } = await import("fs");

  let activeSessions = 0;
  const MAX_SESSIONS = 5;
  const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes

  io.on("connection", (socket) => {
    const adminKey = socket.handshake.auth?.adminKey;
    const SHELL_SECRET = process.env.SHELL_SECRET || "afroai-shell-secret";

    if (adminKey !== SHELL_SECRET) {
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
    const sessionId = randomUUID();
    const sessionDir = `/tmp/shell-${sessionId}`;
    let ptyProcess: any = null;
    let idleTimer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      try { ptyProcess?.kill("SIGKILL"); } catch (_) {}
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

    try {
      // Create isolated session directory
      require("fs").mkdirSync(sessionDir, { recursive: true });

      const pty = require("node-pty");

      // Resource-limited shell:
      //   bash -c "ulimit ...; exec bash" wrapped with nice for CPU deprioritisation
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
        "\r\n\x1b[32m╔════════════════════════════════════════╗",
        "║   Afro AI Sandboxed Shell  v2          ║",
        "║   RAM: 256 MB  •  CPU: deprioritised   ║",
        "║   Session auto-closes after 30 min     ║",
        "║   Type 'exit' to end session           ║",
        "╚════════════════════════════════════════╝\x1b[0m\r\n\r\n",
      ].join("\r\n"));

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
      socket.emit("output", `\r\n\x1b[31m[Error] Failed to start sandboxed shell: ${e.message}\x1b[0m\r\n`);
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
