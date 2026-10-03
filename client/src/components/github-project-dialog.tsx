import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FULLSTACK_EXPORT_NOTICE } from "@/lib/fullstack-project";

export function githubFileKind(file: { encoding?: string; language?: string }): "binary asset" | "text" {
  return file.encoding === "base64" || file.language === "binary" ? "binary asset" : "text";
}

export function githubRepositoryUrl(text: string): string | null {
  // Extract a complete link, never a root-looking prefix of a /tree or /blob
  // URL. The import API only accepts repository roots.
  for (const match of text.match(/https:\/\/github\.com\/[^\s<>"']+/g) || []) {
    const candidate = match.replace(/[.,)!?]+$/, "");
    try {
      const url = new URL(candidate);
      if (url.origin === "https://github.com" && !url.search && !url.hash &&
          /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname) &&
          ![".", ".."].includes(url.pathname.split("/")[2])) return candidate;
    } catch {}
  }
  return null;
}

async function request(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET", credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 409
    ? "The remote branch or project changed. Review the latest changes before trying again."
    : data.error || data.message || `Request failed (${response.status})`);
  return data;
}

interface Props {
  open: boolean;
  mode: "import" | "export";
  url?: string;
  conversationId: number | null;
  onClose: () => void;
  onImported: () => void;
  prepareExport: () => Promise<void>;
  prepareImport?: () => Promise<void>;
}

export function GithubProjectDialog({ open, mode, url = "", conversationId, onClose, onImported, prepareExport, prepareImport }: Props) {
  const [repoUrl, setRepoUrl] = useState(url);
  const [repoName, setRepoName] = useState("");
  const [branch, setBranch] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [importMode, setImportMode] = useState("merge");
  const [message, setMessage] = useState("Update project from Afro AI");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<any>(null);
  const [imported, setImported] = useState<any>(null);
  const [result, setResult] = useState("");
  const [connected, setConnected] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const validImportUrl = githubRepositoryUrl(repoUrl.trim()) === repoUrl.trim();
  useEffect(() => {
    if (!open) return;
    setRepoUrl(url); setReview(null); setImported(null); setResult(""); setError(""); setConfirmed(false); setVisibility("private"); setConnected(false);
    request("/api/github/status").then(s => setConnected(s.connected)).catch(e => setError(e.message));
  }, [open, url, mode]);
  const invalidate = () => { setReview(null); setConfirmed(false); };
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (e) { setError((e as Error).message); invalidate(); }
    finally { setBusy(false); }
  };
  const files = imported?.files || (review?.changes || review?.files || []).filter((f: any) => f.change !== "unchanged");
  return <Dialog open={open} onOpenChange={v => { if (!v && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{mode === "import" ? "Import GitHub project" : "Review GitHub export"}</DialogTitle>
        <DialogDescription>Safe images and fonts are supported as binary assets alongside text files (up to 1 MB per file and 5 MB per project). Git LFS pointers are excluded; Git LFS objects are not imported or exported. Blocked paths are excluded. Importing does not run code.</DialogDescription>
      </DialogHeader>
      {mode === "export" && <p role="note" className="rounded-md border border-primary/25 bg-primary/5 p-3 text-sm">{FULLSTACK_EXPORT_NOTICE}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!conversationId && <p role="alert">Create or open a conversation first.</p>}
      {!connected && <Button variant="outline" onClick={() => { window.location.href = `/api/github/connect?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`; }}>Connect GitHub with OAuth</Button>}
      {!imported && !result && <fieldset disabled={busy} className="space-y-3">
         {mode === "import" ? <><Label htmlFor="repo-url">Repository root URL (not /tree or /blob)</Label><Input id="repo-url" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repository" />
          <Label htmlFor="import-mode">Existing project files</Label><select id="import-mode" className="w-full bg-background border rounded p-2" value={importMode} onChange={e => { setImportMode(e.target.value); setConfirmed(false); }}>
            <option value="merge">Merge (matching paths are overwritten)</option><option value="replace">Replace all project files</option>
          </select></> : <><Label htmlFor="repo-name">Repository name</Label><Input id="repo-name" value={repoName} onChange={e => { setRepoName(e.target.value); invalidate(); }} />
          <Label htmlFor="repo-visibility">Visibility for new repository</Label><select id="repo-visibility" className="w-full bg-background border rounded p-2" value={visibility} onChange={e => { setVisibility(e.target.value); invalidate(); }}><option value="private">Private</option><option value="public">Public — anyone can read these files</option></select></>}
        <Label htmlFor="repo-branch">Branch (optional; repository default)</Label><Input id="repo-branch" value={branch} onChange={e => { setBranch(e.target.value); invalidate(); }} />
        {mode === "import" ? <>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm {importMode === "replace" ? "replacing all existing project files" : "merging and overwriting matching paths"}.</label>
           <Button disabled={!conversationId || !validImportUrl || !confirmed || busy} onClick={() => perform(async () => {
            await prepareImport?.();
            const data = await request("/api/github/import", { conversationId, url: repoUrl.trim(), branch: branch.trim() || undefined, mode: importMode });
            setImported(data); onImported();
          })}>{busy ? "Importing…" : "Import project files"}</Button>
        </> : <>
          <Label htmlFor="commit-message">Commit message</Label><Input id="commit-message" value={message} onChange={e => setMessage(e.target.value)} />
          <Button disabled={!conversationId || !repoName.trim() || !connected || busy} onClick={() => perform(async () => {
            await prepareExport();
            setReview(await request("/api/github/export/preview", { conversationId, repoName: repoName.trim(), branch: branch.trim() || undefined, visibility }));
            setConfirmed(false);
          })}>{busy ? "Loading…" : "Review changed files"}</Button>
        </>}
      </fieldset>}
      {(imported || review) && <section className="space-y-2 text-sm">
        <p className="font-semibold">{imported ? "Imported files" : "Changes to commit"} ({files.length})</p>
        <p className="font-mono break-all">{imported ? `${imported.repo?.owner}/${imported.repo?.name} · ${imported.repo?.branch}` : `${review.owner}/${review.repoName} · ${review.branch}`}</p>
        <p className="text-xs font-mono break-all">Base commit: {imported?.repo?.sha || review?.baseSha || "New repository"}</p>
         <ul className="max-h-48 overflow-auto border rounded p-2">{files.map((f: any, i: number) => <li key={i} className="font-mono break-all">{f.change || f.status || f.action || ""} {typeof f === "string" ? f : f.path || f.name}{typeof f !== "string" && <> <span className="text-muted-foreground">({githubFileKind(f)}{typeof f.bytes === "number" ? `, ${f.bytes} B` : ""})</span></>}</li>)}</ul>
        {(imported?.excluded || review?.excluded)?.length > 0 && <><p>Excluded / unsupported files</p><ul className="max-h-40 overflow-auto">{(imported?.excluded || review?.excluded).map((f: any) => <li key={f.path}>{f.path}: {f.reason}</li>)}</ul></>}
        {review && !result && <>
          <p>One atomic commit. Remote branch changes require a fresh review. Existing repository visibility is not changed.</p>
          <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed the paths and confirm pushing this commit.</label>
          <Button disabled={busy || !confirmed || !message.trim() || files.length === 0} onClick={() => perform(async () => {
            const data = await request("/api/github/export", { conversationId, repoName: review.repoName, branch: review.branch, visibility, message: message.trim(), expectedSha: review.baseSha });
            setResult(data.repoUrl || data.url || `https://github.com/${review.owner}/${review.repoName}`);
          })}>{busy ? "Pushing…" : "Confirm and push commit"}</Button>
        </>}
      </section>}
      {result && <p>Commit pushed. <a className="underline" href={result} target="_blank" rel="noopener noreferrer">View repository</a></p>}
      <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
    </DialogContent>
  </Dialog>;
}