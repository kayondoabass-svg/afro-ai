import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { storage } from "../../storage";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      // "none" allows cross-origin cookies (needed when frontend is on Cloudflare Pages)
      sameSite: isProduction ? "none" : "lax",
      maxAge: sessionTtl,
    },
  });
}

function buildUserClaims(dbUser: any, fallback: { email?: string; firstName?: string; lastName?: string; profileImageUrl?: string }) {
  return {
    claims: {
      sub: dbUser.id,
      email: dbUser.email || fallback.email || "",
      first_name: dbUser.firstName || fallback.firstName || "",
      last_name: dbUser.lastName || fallback.lastName || "",
      profile_image_url: dbUser.profileImageUrl || fallback.profileImageUrl || "",
    },
  };
}

async function handleReferral(req: any, user: any) {
  const refCode = (req.session as any)?.referralCode;
  if (!refCode) return;
  try {
    const referrer = await storage.getUserByReferralCode(refCode);
    const userId = user.claims.sub;
    if (referrer && referrer.id !== userId) {
      const existingUser = await authStorage.getUser(userId);
      if (existingUser && !existingUser.referredBy) {
        const { db } = await import("../../db");
        const { users } = await import("@shared/models/auth");
        const { eq } = await import("drizzle-orm");
        await db.update(users).set({ referredBy: refCode }).where(eq(users.id, userId));
        await storage.createReferral({
          referrerId: referrer.id,
          referredId: userId,
          status: "signed_up",
          commissionAmount: 0,
        });
      }
    }
  } catch (err) {
    console.error("[Auth] Referral tracking error:", err);
  }
  delete (req.session as any).referralCode;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const baseURL = process.env.BASE_URL || "";

  // ── Google ──────────────────────────────────────────────────
  const googleCallbackURL = baseURL ? `${baseURL}/api/auth/google/callback` : "/api/auth/google/callback";
  const clientID = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  console.log("[Auth] Google OAuth configured, callback:", googleCallbackURL);

  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL: googleCallbackURL, proxy: true },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || "";
          const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
          const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
          const profileImageUrl = profile.photos?.[0]?.value || "";
          const dbUser = await authStorage.upsertUser({ id: profile.id, email, firstName, lastName, profileImageUrl });
          done(null, buildUserClaims(dbUser, { email, firstName, lastName, profileImageUrl }));
        } catch (error) {
          console.error("[Auth] Google strategy error:", error);
          done(error as Error);
        }
      }
    )
  );

  // ── GitHub ──────────────────────────────────────────────────
  const githubClientId = (process.env.GITHUB_CLIENT_ID || "").trim();
  const githubClientSecret = (process.env.GITHUB_CLIENT_SECRET || "").trim();
  const githubCallbackURL = baseURL ? `${baseURL}/api/auth/github/callback` : "/api/auth/github/callback";

  if (githubClientId && githubClientSecret) {
    console.log("[Auth] GitHub OAuth configured, callback:", githubCallbackURL);
    passport.use(
      new GitHubStrategy(
        { clientID: githubClientId, clientSecret: githubClientSecret, callbackURL: githubCallbackURL, scope: ["user:email"] },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value || `github_${profile.id}@github.afroai`;
            const displayName = profile.displayName || profile.username || "";
            const nameParts = displayName.split(" ");
            const firstName = nameParts[0] || profile.username || "";
            const lastName = nameParts.slice(1).join(" ") || "";
            const profileImageUrl = profile.photos?.[0]?.value || profile._json?.avatar_url || "";
            const userId = `gh_${profile.id}`;
            const dbUser = await authStorage.upsertUser({ id: userId, email, firstName, lastName, profileImageUrl });
            done(null, buildUserClaims(dbUser, { email, firstName, lastName, profileImageUrl }));
          } catch (error) {
            console.error("[Auth] GitHub strategy error:", error);
            done(error as Error);
          }
        }
      )
    );
  } else {
    console.log("[Auth] GitHub OAuth not configured (missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET)");
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  const rateLimit = (await import("express-rate-limit")).default;
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

  // ── Google routes ────────────────────────────────────────────
  app.get("/api/login", authLimiter, (req: any, res, next) => {
    if (req.query.ref) req.session.referralCode = req.query.ref;
    passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", (err: any, user: any, info: any) => {
      if (err) {
        console.error("[Auth] Google callback error:", err.message, err.code, err.status, JSON.stringify(err));
        return res.redirect("/?error=auth_failed&reason=" + encodeURIComponent(err.message || "unknown"));
      }
      if (!user) {
        console.error("[Auth] Google no user returned, info:", JSON.stringify(info));
        return res.redirect("/?error=auth_failed&reason=no_user");
      }
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          console.error("[Auth] Google logIn error:", loginErr);
          return res.redirect("/?error=auth_failed&reason=login_error");
        }
        await handleReferral(req, user);
        return res.redirect("/");
      });
    })(req, res, next);
  });

  // ── GitHub routes ────────────────────────────────────────────
  app.get("/api/auth/github", authLimiter, (req: any, res, next) => {
    if (req.query.ref) req.session.referralCode = req.query.ref;
    if (!githubClientId || !githubClientSecret) {
      return res.redirect("/?error=auth_failed&reason=github_not_configured");
    }
    passport.authenticate("github", { scope: ["user:email"] })(req, res, next);
  });

  app.get("/api/auth/github/callback", (req, res, next) => {
    passport.authenticate("github", (err: any, user: any, info: any) => {
      if (err) return res.redirect("/?error=auth_failed&reason=" + encodeURIComponent(err.message || "unknown"));
      if (!user) return res.redirect("/?error=auth_failed&reason=no_user");
      req.logIn(user, async (loginErr) => {
        if (loginErr) return res.redirect("/?error=auth_failed&reason=login_error");
        await handleReferral(req, user);
        return res.redirect("/");
      });
    })(req, res, next);
  });

  // ── TikTok routes (PKCE OAuth 2.0) ──────────────────────────
  const tiktokClientKey = (process.env.TIKTOK_CLIENT_KEY || "").trim();
  const tiktokClientSecret = (process.env.TIKTOK_CLIENT_SECRET || "").trim();
  const tiktokCallbackURL = baseURL ? `${baseURL}/api/auth/tiktok/callback` : "/api/auth/tiktok/callback";

  app.get("/api/auth/tiktok", authLimiter, (req: any, res) => {
    if (!tiktokClientKey) return res.redirect("/?error=auth_failed&reason=tiktok_not_configured");
    if (req.query.ref) req.session.referralCode = req.query.ref;

    const codeVerifier = crypto.randomBytes(64).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const state = crypto.randomBytes(16).toString("hex");

    (req.session as any).tiktokCodeVerifier = codeVerifier;
    (req.session as any).tiktokState = state;

    const params = new URLSearchParams({
      client_key: tiktokClientKey,
      response_type: "code",
      scope: "user.info.basic",
      redirect_uri: tiktokCallbackURL,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
  });

  app.get("/api/auth/tiktok/callback", async (req: any, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) return res.redirect("/?error=auth_failed&reason=" + encodeURIComponent(String(error)));

      const storedState = (req.session as any).tiktokState;
      const codeVerifier = (req.session as any).tiktokCodeVerifier;

      if (!state || state !== storedState) return res.redirect("/?error=auth_failed&reason=state_mismatch");
      if (!code || !codeVerifier) return res.redirect("/?error=auth_failed&reason=missing_code");

      delete (req.session as any).tiktokState;
      delete (req.session as any).tiktokCodeVerifier;

      const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: tiktokClientKey,
          client_secret: tiktokClientSecret,
          code: String(code),
          grant_type: "authorization_code",
          redirect_uri: tiktokCallbackURL,
          code_verifier: codeVerifier,
        }),
      });

      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) {
        console.error("[Auth] TikTok token error:", tokenData);
        return res.redirect("/?error=auth_failed&reason=tiktok_token_failed");
      }

      const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const userData = await userRes.json() as any;
      const profile = userData?.data?.user;
      if (!profile?.open_id) {
        console.error("[Auth] TikTok user info error:", userData);
        return res.redirect("/?error=auth_failed&reason=tiktok_user_failed");
      }

      const userId = `tt_${profile.open_id}`;
      const email = `tiktok_${profile.open_id}@tiktok.afroai`;
      const displayName = profile.display_name || "TikTok User";
      const nameParts = displayName.split(" ");
      const firstName = nameParts[0] || "TikTok";
      const lastName = nameParts.slice(1).join(" ") || "User";
      const profileImageUrl = profile.avatar_url || "";

      const dbUser = await authStorage.upsertUser({ id: userId, email, firstName, lastName, profileImageUrl });
      const user = buildUserClaims(dbUser, { email, firstName, lastName, profileImageUrl });

      req.logIn(user, async (loginErr: any) => {
        if (loginErr) return res.redirect("/?error=auth_failed&reason=login_error");
        await handleReferral(req, user);
        return res.redirect("/");
      });
    } catch (err) {
      console.error("[Auth] TikTok callback error:", err);
      res.redirect("/?error=auth_failed&reason=tiktok_error");
    }
  });

  // ── reCAPTCHA verification helper ────────────────────────────
  async function verifyRecaptcha(token: string): Promise<boolean> {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) return true; // skip if not configured
    try {
      const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      });
      const data = await r.json() as any;
      return data.success === true;
    } catch {
      return false;
    }
  }

  // ── Email/Password Registration ──────────────────────────────
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { email, password, firstName, lastName, recaptchaToken } = req.body;
      if (recaptchaToken) {
        const valid = await verifyRecaptcha(recaptchaToken);
        if (!valid) return res.status(400).json({ message: "reCAPTCHA verification failed. Please try again." });
      }
      if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

      const { db } = await import("../../db");
      const { users } = await import("@shared/models/auth");
      const { eq } = await import("drizzle-orm");

      const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (existing) return res.status(409).json({ message: "An account with this email already exists" });

      const passwordHash = await bcrypt.hash(password, 10);
      const [newUser] = await db.insert(users).values({
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName || "",
        lastName: lastName || "",
      }).returning();

      const userClaims = buildUserClaims(newUser, { email: newUser.email || "", firstName: newUser.firstName || "", lastName: newUser.lastName || "" });
      req.logIn(userClaims, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        res.json({ success: true });
      });
    } catch (err) {
      console.error("[Auth] Register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // ── Email/Password Login ─────────────────────────────────────
  app.post("/api/auth/login/email", authLimiter, async (req, res) => {
    try {
      const { email, password, recaptchaToken } = req.body;
      if (recaptchaToken) {
        const valid = await verifyRecaptcha(recaptchaToken);
        if (!valid) return res.status(400).json({ message: "reCAPTCHA verification failed. Please try again." });
      }
      if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

      const { db } = await import("../../db");
      const { users } = await import("@shared/models/auth");
      const { eq } = await import("drizzle-orm");

      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (!user || !user.passwordHash) return res.status(401).json({ message: "Invalid email or password" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });

      const userClaims = buildUserClaims(user, { email: user.email || "", firstName: user.firstName || "", lastName: user.lastName || "" });
      req.logIn(userClaims, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        res.json({ success: true });
      });
    } catch (err) {
      console.error("[Auth] Email login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ── Logout ───────────────────────────────────────────────────
  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) console.error("Logout error:", err);
      req.session.destroy((err) => {
        if (err) console.error("Session destroy error:", err);
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });
}

export const FOUNDER_EMAIL = "kayondoabass@gmail.com";

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  return next();
};

export const isFounder: RequestHandler = async (req: any, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const email = req.user?.claims?.email;
  if (email !== FOUNDER_EMAIL) return res.status(403).json({ message: "Forbidden: Founder access only" });
  return next();
};
