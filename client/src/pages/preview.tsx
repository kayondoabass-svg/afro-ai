import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Smartphone, Monitor, Tablet, ExternalLink,
  Sparkles, RefreshCw, Globe, Share2, Copy, Loader2, QrCode, Download, X,
} from "lucide-react";

interface PreviewData {
  project: { id: number; name: string; description: string | null; type: string };
  hasContent: boolean;
  htmlContent: string;
  label: string | null;
  updatedAt: string | null;
  publishedUrl: string | null;
}

type Device = "mobile" | "tablet" | "desktop";

const DEVICE_WIDTHS: Record<Device, string> = {
  mobile: "375px",
  tablet: "768px",
  desktop: "100%",
};

export default function PreviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [device, setDevice] = useState<Device>("mobile");
  const [showQr, setShowQr] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<PreviewData>({
    queryKey: ["/api/projects", projectId, "preview"],
    enabled: !!projectId,
  });

  useEffect(() => {
    document.title = data?.project?.name
      ? `${data.project.name} — Preview`
      : "Preview — Afro AI";
  }, [data]);

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/dashboard");
  };

  const goEdit = () => {
    if (!data) return;
    setLocation(
      `/chat?projectId=${projectId}&project=${encodeURIComponent(data.project.name)}&type=${encodeURIComponent(data.project.type)}`,
    );
  };

  const copyPublishedLink = async () => {
    if (!data?.publishedUrl) return;
    try {
      await navigator.clipboard.writeText(data.publishedUrl);
      toast({ title: "Link copied", description: data.publishedUrl });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const shareSite = async () => {
    if (!data?.publishedUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: data.project.name,
          text: `Check out my site: ${data.project.name}`,
          url: data.publishedUrl,
        });
      } catch {}
    } else {
      copyPublishedLink();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex-shrink-0"
            onClick={goBack}
            data-testid="button-back"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate" data-testid="text-project-name">
              {data?.project?.name || (isLoading ? "Loading…" : "Preview")}
            </h1>
            <p className="text-[11px] text-zinc-500 truncate">
              {data?.publishedUrl ? "Live · " + data.publishedUrl.replace(/^https?:\/\//, "") : "Draft preview"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh"
            aria-label="Refresh preview"
          >
            {isRefetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium"
            onClick={goEdit}
            data-testid="button-edit"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
        </div>
      </header>

      {/* Device toggle */}
      <div className="flex items-center justify-center gap-1 px-3 py-2 border-b border-zinc-800/60 bg-zinc-950 flex-shrink-0">
        {([
          { key: "mobile", icon: Smartphone, label: "Phone" },
          { key: "tablet", icon: Tablet, label: "Tablet" },
          { key: "desktop", icon: Monitor, label: "Computer" },
        ] as const).map(d => {
          const Icon = d.icon;
          const active = device === d.key;
          return (
            <button
              key={d.key}
              onClick={() => setDevice(d.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
              data-testid={`button-device-${d.key}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {d.label}
            </button>
          );
        })}
      </div>

      {/* Preview surface */}
      <div className="flex-1 overflow-auto bg-zinc-900/40 p-3 flex items-start justify-center">
        {isLoading ? (
          <div className="w-full max-w-md mt-16 space-y-3">
            <div className="h-32 rounded-lg bg-zinc-900 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-zinc-900 animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-zinc-900 animate-pulse" />
          </div>
        ) : !data?.hasContent ? (
          <EmptyState onEdit={goEdit} />
        ) : (
          <div
            className="bg-white rounded-xl shadow-2xl overflow-hidden border border-zinc-800 transition-all duration-300"
            style={{
              width: DEVICE_WIDTHS[device],
              maxWidth: "100%",
              height: device === "mobile" ? "667px" : device === "tablet" ? "1024px" : "calc(100vh - 180px)",
            }}
          >
            <iframe
              title="Preview"
              srcDoc={data.htmlContent}
              sandbox="allow-scripts allow-forms allow-same-origin"
              className="w-full h-full border-0"
              data-testid="iframe-preview"
            />
          </div>
        )}
      </div>

      {/* Bottom actions when published */}
      {data?.publishedUrl && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-zinc-800 bg-zinc-950 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800 text-xs"
            onClick={() => window.open(data.publishedUrl!, "_blank")}
            data-testid="button-open-live"
          >
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            Open live site
            <ExternalLink className="w-3 h-3 ml-1.5 opacity-60" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800"
            onClick={() => setShowQr(true)}
            data-testid="button-qr"
            aria-label="Show QR code"
          >
            <QrCode className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800"
            onClick={copyPublishedLink}
            data-testid="button-copy-link"
            aria-label="Copy link"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800"
            onClick={shareSite}
            data-testid="button-share"
            aria-label="Share"
          >
            <Share2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {showQr && data?.publishedUrl && (
        <QrModal
          url={data.publishedUrl}
          name={data.project?.name || "My site"}
          onClose={() => setShowQr(false)}
          onCopy={copyPublishedLink}
        />
      )}
    </div>
  );
}

function QrModal({ url, name, onClose, onCopy }: { url: string; name: string; onClose: () => void; onCopy: () => void }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=2&data=${encodeURIComponent(url)}`;
  const downloadSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=4&format=png&data=${encodeURIComponent(url)}`;

  const handleDownload = async () => {
    try {
      const res = await fetch(downloadSrc);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="modal-qr"
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-sm w-full p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          aria-label="Close"
          data-testid="button-qr-close"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-base font-semibold text-zinc-100 mb-1 pr-8">Scan to open your site</h3>
        <p className="text-xs text-zinc-400 mb-4">Show this to a customer — they point their phone camera at it and your site opens.</p>

        <div className="bg-white rounded-xl p-4 flex items-center justify-center mb-4">
          <img
            src={qrSrc}
            alt={`QR code for ${url}`}
            className="w-full max-w-[280px] h-auto"
            data-testid="img-qr-large"
          />
        </div>

        <p className="text-[11px] text-zinc-500 text-center mb-4 break-all" data-testid="text-qr-url">{url}</p>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 h-10"
            onClick={handleDownload}
            data-testid="button-qr-download"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Download
          </Button>
          <Button
            className="bg-violet-500 hover:bg-violet-600 text-white h-10"
            onClick={onCopy}
            data-testid="button-qr-copy"
          >
            <Copy className="w-4 h-4 mr-1.5" />
            Copy link
          </Button>
        </div>
        <p className="text-[11px] text-zinc-500 text-center mt-3 leading-relaxed">
          Tip: print it on a flyer, business card, or stick it on your shop door.
        </p>
      </div>
    </div>
  );
}

function EmptyState({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="text-center max-w-sm mt-16 px-6" data-testid="empty-preview">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
        <Sparkles className="w-7 h-7 text-violet-400" />
      </div>
      <h2 className="text-lg font-semibold mb-1.5">Nothing to preview yet</h2>
      <p className="text-sm text-zinc-400 leading-relaxed mb-5">
        Tell the AI what you want to build, and your site will show up here as soon as it's ready.
      </p>
      <Button
        className="h-10 px-5 bg-violet-500 hover:bg-violet-600 text-white font-medium"
        onClick={onEdit}
        data-testid="button-start-building"
      >
        <Sparkles className="w-4 h-4 mr-1.5" />
        Start building
      </Button>
    </div>
  );
}
