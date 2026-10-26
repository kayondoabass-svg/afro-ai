---
name: Blank page after deploy (stale chunks)
description: Why lazy-loaded routes render a fully black page after a redeploy, and the ErrorBoundary fix.
---

# Blank page / black screen on a route after a redeploy

**Symptom:** tapping a specific route (e.g. `/integrations`) shows a fully black page — no sidebar, no header — and it's repeatable until a hard refresh.

**Root cause:** the app code-splits every page via `React.lazy(() => import(...))`. After a production redeploy the chunk filenames are re-hashed. A client still holding the old shell (browser cache OR the PWA service worker that precaches the shell in `client/src/main.tsx`) requests an old chunk hash that no longer exists → the dynamic `import()` rejects. `<Suspense>` only handles the *pending* promise, not the *rejection*; the rejection propagates as a render error. With **no ErrorBoundary**, React unmounts the entire tree → black screen.

**Why it looked page-specific:** only routes whose chunk the client hadn't already cached fail; already-loaded routes keep working, so it seems like "only this page is broken."

**Fix:** `client/src/components/error-boundary.tsx` wraps each `<Suspense>` route switch in `App.tsx`. It detects chunk-load errors by message ("failed to fetch dynamically imported module", "ChunkLoadError", bad MIME type, etc.) and forces ONE `window.location.reload()` — guarded by a `sessionStorage` flag so a genuinely broken build can't reload-loop. Non-chunk render errors show a friendly "Reload" card instead of a blank page.

**How to apply:** any new top-level `<Suspense>` that renders lazy routes must be wrapped in `<ErrorBoundary>`. Don't remove the sessionStorage reload guard. The PWA service worker (`/sw.js`) is the main reason stale shells persist — keep that in mind when debugging "works after hard refresh" reports.
