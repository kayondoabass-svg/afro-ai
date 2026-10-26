import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Canonical-host redirect ──────────────────────────────────────────────────
// The Cloudflare Worker that issues our session cookie sets it as a
// host-only cookie (no `Domain=` attribute) for security reasons. That means a
// cookie set on `www.afroaigroup.com` is NOT sent to `afroaigroup.com` and
// vice-versa.
//
// Mobile browsers (especially Safari and many in-app browsers) frequently
// auto-complete URLs to `www.*`. If the user logs in on the www host but any
// later request resolves to the apex host (e.g. via a CDN canonical redirect),
// the cookie is dropped and the user looks logged-out — they get bounced back
// to the marketing landing page even though login succeeded.
//
// We dodge the whole class of bug by sending every visitor to the canonical
// apex host as the very first thing the app does, BEFORE any login attempt
// or `/cf-auth/me` call. This is a no-op for users who are already on apex
// and a one-time 0-cost client-side redirect for everyone else.
(() => {
  if (typeof window === "undefined") return;
  if (window.location.hostname === "www.afroaigroup.com") {
    const apex = window.location.href.replace("://www.afroaigroup.com", "://afroaigroup.com");
    window.location.replace(apex);
  }
})();

createRoot(document.getElementById("root")!).render(<App />);

// ── Service Worker registration (PWA) ────────────────────────────────────────
// Registered after first paint to avoid blocking the initial render. The SW
// itself is a no-op on first visit (it precaches the shell + activates), and
// from the second visit onwards provides offline support and faster loads.
if (typeof window !== "undefined" && "serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("[pwa] Service worker registration failed:", err);
    });
  });
}
