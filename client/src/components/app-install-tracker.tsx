import { useEffect } from "react";

const ID_KEY = "afroai-installation-id";
const DETECTED_KEY = "afroai-installation-detected";
const SENT_KEY = "afroai-installation-reported";

export function AppInstallTracker() {
  useEffect(() => {
    let sending = false;
    const record = async () => {
      try {
        if (sending || localStorage.getItem(SENT_KEY)) return;
        localStorage.setItem(DETECTED_KEY, "1");
        let installationId = localStorage.getItem(ID_KEY);
        if (!installationId) {
          installationId = crypto.randomUUID();
          localStorage.setItem(ID_KEY, installationId);
        }
        sending = true;
        const response = await fetch("/api/app-installs", {
          method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installationId }),
        });
        if (response.ok) localStorage.setItem(SENT_KEY, "1");
      } catch {
        // Leave the same identifier pending for retry. Tracking must not block the app.
      } finally { sending = false; }
    };
    const retry = () => {
      try {
        if (localStorage.getItem(DETECTED_KEY) ||
            window.matchMedia("(display-mode: standalone)").matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true) {
          void record();
        }
      } catch { /* Storage unavailable: avoid counting a new anonymous ID on every load. */ }
    };
    window.addEventListener("appinstalled", record);
    window.addEventListener("online", retry);
    retry();
    return () => {
      window.removeEventListener("appinstalled", record);
      window.removeEventListener("online", retry);
    };
  }, []);
  return null;
}