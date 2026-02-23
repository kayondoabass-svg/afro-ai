import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { storage } from "../../storage";

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
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const callbackURL = process.env.BASE_URL
    ? `${process.env.BASE_URL}/api/auth/google/callback`
    : "/api/auth/google/callback";

  const clientID = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

  console.log("[Auth] Google OAuth configured, callback:", callbackURL);

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        proxy: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || "";
          const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
          const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
          const profileImageUrl = profile.photos?.[0]?.value || "";

          const dbUser = await authStorage.upsertUser({
            id: profile.id,
            email,
            firstName,
            lastName,
            profileImageUrl,
          });

          const user = {
            claims: {
              sub: dbUser.id,
              email: dbUser.email || email,
              first_name: dbUser.firstName || firstName,
              last_name: dbUser.lastName || lastName,
              profile_image_url: dbUser.profileImageUrl || profileImageUrl,
            },
          };

          done(null, user);
        } catch (error) {
          console.error("[Auth] Error in Google strategy callback:", error);
          done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req: any, res, next) => {
    if (req.query.ref) {
      req.session.referralCode = req.query.ref;
    }
    passport.authenticate("google", {
      scope: ["profile", "email"],
      prompt: "select_account",
    })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", (err: any, user: any, info: any) => {
      if (err) {
        console.error("[Auth] Callback error:", err.message, err.code, err.status);
        return res.redirect("/?error=auth_failed&reason=" + encodeURIComponent(err.message || "unknown"));
      }
      if (!user) {
        console.error("[Auth] No user returned:", info);
        return res.redirect("/?error=auth_failed&reason=no_user");
      }
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          console.error("[Auth] Login error:", loginErr);
          return res.redirect("/?error=auth_failed&reason=login_error");
        }
        const refCode = (req.session as any)?.referralCode;
        if (refCode) {
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
        return res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });
}

export const FOUNDER_EMAIL = "kayondoabass@gmail.com";

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

export const isFounder: RequestHandler = async (req: any, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const email = req.user?.claims?.email;
  if (email !== FOUNDER_EMAIL) {
    return res.status(403).json({ message: "Forbidden: Founder access only" });
  }
  return next();
};
