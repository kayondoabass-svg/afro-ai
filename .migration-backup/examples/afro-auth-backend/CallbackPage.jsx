/**
 * Optional React page at the EXACT registered callback path.
 * Mount the backend router with renderCallback:false; the backend handles
 * POST on this same URL and your frontend router renders this page on GET.
 * It calls only your own backend. No API key or Afro JWT belongs here.
 */
import { useEffect, useRef, useState } from "react";

export default function CallbackPage() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [error, setError] = useState("");
  const request = useRef(null);
  useEffect(() => {
    let active = true;
    if (!request.current) {
      const state = params.get("state");
      const verification_token = params.get("verification_token");
      const code = params.get("code");
      // Remove capability values from browser history/referrers immediately.
      window.history.replaceState(null, "", window.location.pathname);
      request.current = (async () => {
        if (!state || (!verification_token && !code)) throw new Error("This confirmation link is incomplete.");
        if (window.top !== window.self) throw new Error("Open the confirmation link in its own browser tab.");
        if (document.prerendering) await new Promise(resolve =>
          document.addEventListener("prerenderingchange", resolve, { once: true }));
        if (document.visibilityState === "hidden") await new Promise(resolve => {
          const visible = () => {
            if (document.visibilityState !== "hidden") {
              document.removeEventListener("visibilitychange", visible);
              resolve();
            }
          };
          document.addEventListener("visibilitychange", visible);
        });
        const response = await fetch(window.location.pathname, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ state, ...(code ? { code } : { verification_token }) }),
        });
        if (!response.ok) throw new Error("This confirmation is unavailable or was already used. Return to login to continue.");
        const result = await response.json();
        const destination = new URL(result.redirect, window.location.origin);
        if (!result.ok || destination.origin !== window.location.origin) throw new Error("Invalid sign-in destination.");
        return destination.pathname + destination.search + destination.hash;
      })();
    }
    request.current.then(
      destination => { if (active) window.location.replace(destination); },
      problem => { if (active) setError(problem.message || "Unable to finish signing in."); },
    );
    return () => { active = false; };
  }, [params]);
  return <main aria-live="polite">
    <h1>{error ? "Unable to finish signing in" : "Confirming your email…"}</h1>
    <p>{error || "Please wait while your website securely creates your new session."}</p>
    {error && <a href="/login">Return to login</a>}
  </main>;
}
