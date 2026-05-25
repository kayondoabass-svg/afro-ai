import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction, Express } from "express";

declare global {
  namespace Express {
    interface Request {
      traceId: string;
    }
  }
}

let sentryEnabled = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[Sentry] SENTRY_DSN not set — error tracking disabled (no-op mode).");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: process.env.RELEASE_SHA || undefined,
    // Errors are always captured. Performance tracing is OFF by default
    // because full Express auto-instrumentation requires Sentry to be loaded
    // via `node --import ./instrument.mjs server/index.js` BEFORE express
    // itself is imported (a package.json script change we don't ship here).
    // Set SENTRY_TRACES_SAMPLE_RATE > 0 only if/when that flag is added.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
    ignoreErrors: [
      "ECONNRESET",
      "ECONNABORTED",
      "ETIMEDOUT",
      "Non-Error promise rejection captured",
    ],
  });
  sentryEnabled = true;
  console.log(`[Sentry] ✓ Initialised (env=${process.env.NODE_ENV || "development"})`);
}

export function requestTracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-trace-id"] || req.headers["x-correlation-id"];
  const id = Array.isArray(incoming) ? incoming[0] : incoming;
  req.traceId = id && /^[A-Za-z0-9_-]{8,128}$/.test(id) ? id : randomUUID();
  res.setHeader("X-Trace-ID", req.traceId);

  if (sentryEnabled) {
    Sentry.getCurrentScope().setTag("traceId", req.traceId);
  }
  next();
}

export function attachSentryErrorHandler(app: Express) {
  if (!sentryEnabled) return;
  Sentry.setupExpressErrorHandler(app);
}

export function captureServerError(err: unknown, ctx?: { traceId?: string; userId?: string; route?: string }) {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    if (ctx?.traceId) scope.setTag("traceId", ctx.traceId);
    if (ctx?.route) scope.setTag("route", ctx.route);
    if (ctx?.userId) scope.setUser({ id: ctx.userId });
    Sentry.captureException(err);
  });
}

export function isSentryEnabled() {
  return sentryEnabled;
}
