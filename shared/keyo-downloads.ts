export type KeyoDownloadCategory = "desktop" | "source" | "bundle" | "metadata";
export function keyoDownloadCategory(name: string): KeyoDownloadCategory {
  if (!/\.(?:zip|tgz|tar\.gz)$/i.test(name)) return "metadata";
  if (/source|\.tgz$/i.test(name)) return "source";
  if (/(?:win32|darwin|linux)-(?:x64|arm64)/i.test(name)) return "desktop";
  return "bundle";
}
export function keyoTrackedHref(destination: "github" | "hugging-face", asset?: string) {
  return `/api/keyo-studio/outbound/${destination}${asset ? `?asset=${encodeURIComponent(asset)}` : ""}`;
}
export interface KeyoDownloadAnalytics {
  platform: {
    status: "available" | "unavailable"; total: number | null;
    trackingSince: string | null;
    byArtifact: { name: string; category: KeyoDownloadCategory; count: number }[];
    recordingHealthy: boolean; note: string;
  };
  github: {
    status: "available" | "unavailable"; total: number | null;
    desktop: number | null; source: number | null; bundles: number | null;
    byRelease: { version: string; total: number; assets: { name: string; category: KeyoDownloadCategory; count: number }[] }[];
    checkedAt: string | null; note: string;
  };
  huggingFace: {
    status: "available" | "not_published" | "unavailable"; total: number | null;
    checkedAt: string | null; note: string;
  };
  outboundClicks: { github: number | null; huggingFace: number | null };
  note: string;
}
