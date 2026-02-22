import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

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

  console.log("[Auth] Google OAuth config:");
  console.log("[Auth]   Client ID:", clientID?.substring(0, 20) + "...");
  console.log("[Auth]   Client Secret length:", clientSecret?.length);
  console.log("[Auth]   Secret starts with:", clientSecret?.substring(0, 6) + "...");
  console.log("[Auth]   Secret ends with:", "..." + clientSecret?.substring(clientSecret.length - 4));
  console.log("[Auth]   Callback URL:", callbackURL);
  console.log("[Auth]   BASE_URL:", process.env.BASE_URL || "(not set)");

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

          await authStorage.upsertUser({
            id: profile.id,
            email,
            firstName,
            lastName,
            profileImageUrl,
          });

          const user = {
            claims: {
              sub: profile.id,
              email,
              first_name: firstName,
              last_name: lastName,
              profile_image_url: profileImageUrl,
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

  app.get("/api/login", passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  }));

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
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("[Auth] Login error:", loginErr);
          return res.redirect("/?error=auth_failed&reason=login_error");
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

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};
