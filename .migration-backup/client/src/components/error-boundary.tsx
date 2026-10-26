import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

// Matches the "stale chunk after a redeploy" class of error: the browser (or the
// PWA service worker that precaches the app shell) still references an old
// lazy-loaded JS chunk whose hashed filename no longer exists on the server, so
// the dynamic import() rejects. Without a boundary this unmounts the whole React
// tree and the user sees a fully blank page.
function isChunkLoadError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  return (
    name === "chunkloaderror" ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("'text/html' is not a valid javascript mime type") ||
    msg.includes("expected a javascript module script") ||
    msg.includes("load failed") || // Safari's generic dynamic-import failure
    msg.includes("unable to preload css")
  );
}

const RELOAD_FLAG = "afroai_chunk_reload_at";
// Only auto-reload if the last auto-reload was longer ago than this. Lets a
// *later* deploy recover, while a genuinely broken build that errors again
// immediately after reload falls through to the manual fallback (no loop).
const RELOAD_COOLDOWN_MS = 10_000;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: unknown) {
    if (isChunkLoadError(error)) {
      // A new version was deployed and this client is holding stale chunk refs.
      // Force a hard reload to pull the fresh shell + chunks. Guard with a
      // timestamp so a genuinely-broken build can't loop forever, while a
      // later deploy in the same tab can still auto-recover.
      try {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
        if (Date.now() - last > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    try {
      sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Chunk errors trigger an auto-reload in componentDidCatch; render a quiet
    // placeholder while that reload happens (or a manual prompt if it was
    // already attempted this session).
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[60vh]" data-testid="error-boundary">
        <div className="max-w-md text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {this.state.isChunkError ? "Updating to the latest version…" : "Something went wrong"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {this.state.isChunkError
              ? "A new version of Afro AI is available. Reload to continue."
              : "This page hit an unexpected error. Reloading usually fixes it."}
          </p>
          <Button onClick={this.handleReload} data-testid="button-error-reload">
            <RotateCw className="w-4 h-4 mr-2" /> Reload
          </Button>
        </div>
      </div>
    );
  }
}
