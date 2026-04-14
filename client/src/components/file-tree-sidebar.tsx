import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  FileCode2, FileText, FileCog, FileJson, FolderOpen,
  Plus, Trash2, ChevronRight, ChevronDown, RefreshCw, X,
} from "lucide-react";

export interface ProjectFile {
  id: number;
  name: string;
  path: string;
  language: string;
  updated_at: string;
  content?: string;
}

interface FileTreeSidebarProps {
  conversationId: number | null;
  openedFileId: number | null;
  onFileOpen: (file: ProjectFile) => void;
  onClose: () => void;
}

function getFileIcon(name: string) {
  if (name.endsWith(".html")) return <FileCode2 className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />;
  if (name.endsWith(".css")) return <FileCog className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
  if (name.endsWith(".js") || name.endsWith(".ts")) return <FileText className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
  if (name.endsWith(".json")) return <FileJson className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
}

export function FileTreeSidebar({ conversationId, openedFileId, onFileOpen, onClose }: FileTreeSidebarProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [expanded, setExpanded] = useState(true);

  const { data: files = [], isLoading, refetch } = useQuery<ProjectFile[]>({
    queryKey: ["/api/d1/project-files", conversationId],
    queryFn: () =>
      fetch(`/api/d1/project-files?conversationId=${conversationId}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!conversationId,
    staleTime: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => {
      const ext = name.includes(".") ? name.split(".").pop()! : "html";
      const langMap: Record<string, string> = { html: "html", css: "css", js: "javascript", ts: "typescript", json: "json", md: "markdown" };
      return apiRequest("POST", "/api/d1/project-files", {
        conversationId: String(conversationId),
        name,
        path: name,
        language: langMap[ext] || "text",
        content: "",
      }).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/d1/project-files", conversationId] });
      setNewFileName("");
      setAdding(false);
    },
    onError: (e: any) => toast({ title: "Failed to create file", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/d1/project-files/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/d1/project-files", conversationId] });
      toast({ title: "File deleted" });
    },
    onError: (e: any) => toast({ title: "Failed to delete file", description: e.message, variant: "destructive" }),
  });

  const handleFileClick = async (file: ProjectFile) => {
    if (file.id === openedFileId) return;
    try {
      const res = await fetch(`/api/d1/project-files/${file.id}`, { credentials: "include" });
      const full = await res.json();
      onFileOpen(full);
    } catch {
      onFileOpen(file);
    }
  };

  const handleAddFile = () => {
    const name = newFileName.trim();
    if (!name) return;
    if (!name.includes(".")) {
      toast({ title: "Include file extension", description: "e.g. index.html, styles.css, app.js", variant: "destructive" });
      return;
    }
    createMutation.mutate(name);
  };

  if (!conversationId) return null;

  return (
    <div className="w-52 flex-shrink-0 border-r bg-card/30 flex flex-col hidden md:flex" data-testid="file-tree-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => refetch()} title="Refresh" data-testid="button-refresh-files">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setAdding(true)} title="New file" data-testid="button-new-file">
            <Plus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose} title="Close" data-testid="button-close-filetree">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* New file input */}
      {adding && (
        <div className="px-2 py-2 border-b flex gap-1">
          <Input
            autoFocus
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            placeholder="filename.html"
            className="h-7 text-xs font-mono"
            onKeyDown={e => {
              if (e.key === "Enter") handleAddFile();
              if (e.key === "Escape") { setAdding(false); setNewFileName(""); }
            }}
            data-testid="input-new-filename"
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleAddFile} disabled={createMutation.isPending} data-testid="button-confirm-new-file">
            Add
          </Button>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Project folder */}
        <button
          className="w-full flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-expand-folder"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-medium truncate">project</span>
        </button>

        {expanded && (
          <div className="ml-3">
            {isLoading ? (
              <div className="space-y-1 px-2 py-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : files.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2 italic">No files yet</p>
            ) : (
              files.map(file => (
                <div
                  key={file.id}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-sm cursor-pointer text-xs transition-colors ${
                    openedFileId === file.id
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                  onClick={() => handleFileClick(file)}
                  data-testid={`file-item-${file.id}`}
                >
                  {getFileIcon(file.name)}
                  <span className="truncate flex-1 font-mono">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 flex-shrink-0 hover:text-red-500"
                    onClick={e => { e.stopPropagation(); deleteMutation.mutate(file.id); }}
                    data-testid={`button-delete-file-${file.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Auto-saves files to D1 when the AI generates code */
export async function saveProjectFiles(conversationId: number, htmlCode: string) {
  if (!conversationId || !htmlCode) return;

  const styleMatch = htmlCode.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const scriptMatch = htmlCode.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i);

  const cssContent = styleMatch ? styleMatch[1].trim() : "";
  const jsContent = scriptMatch ? scriptMatch[1].trim() : "";
  let htmlContent = htmlCode;
  if (cssContent) htmlContent = htmlContent.replace(/<style[^>]*>[\s\S]*?<\/style>/i, `<link rel="stylesheet" href="styles.css">`);
  if (jsContent) htmlContent = htmlContent.replace(/<script(?![^>]*src)[^>]*>[\s\S]*?<\/script>/i, `<script src="script.js"></script>`);

  const save = (name: string, lang: string, content: string) =>
    fetch("/api/d1/project-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ conversationId: String(conversationId), name, path: name, language: lang, content }),
    }).catch(() => {});

  await Promise.all([
    save("index.html", "html", htmlContent),
    cssContent ? save("styles.css", "css", cssContent) : null,
    jsContent ? save("script.js", "javascript", jsContent) : null,
  ].filter(Boolean));
}
