import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, FolderKanban, Plus, Pencil } from "lucide-react";

export interface EmailProject {
  id: number | string;
  name: string;
  legacy: boolean;
  createdAt: string;
  domainCount: number;
  keyCount: number;
}

export function EmailProjectWorkspace({ selectedId, onSelect, children }: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  children?: ReactNode;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [rename, setRename] = useState("");
  const initializedSelection = useRef(false);
  const { data: projects = [], isLoading, isError, refetch } = useQuery<EmailProject[]>({
    queryKey: ["/api/email-api/projects"], retry: false,
  });
  const create = useMutation({
    mutationFn: async (projectName: string) => (await apiRequest("POST", "/api/email-api/projects", { name: projectName })).json() as Promise<EmailProject>,
    retry: false,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/email-api/projects"] });
      onSelect(String(project.id)); setName(""); setOpen(false);
      toast({ title: "Email project created" });
    },
    onError: () => toast({ title: "Couldn't create project", variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: async (vars: { id: string; name: string }) => (await apiRequest("PATCH", `/api/email-api/projects/${encodeURIComponent(vars.id)}`, { name: vars.name })).json(),
    retry: false,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/email-api/projects"] }); setRenaming(false); toast({ title: "Project renamed" }); },
    onError: () => toast({ title: "Couldn't rename project", variant: "destructive" }),
  });
  const project = projects.find((item) => String(item.id) === selectedId) ?? null;
  useEffect(() => {
    if (!projects.length) { if (!isLoading && !isError) onSelect(null); return; }
    if (!initializedSelection.current) {
      initializedSelection.current = true;
      const requested = new URLSearchParams(window.location.search).get("project");
      if (requested && projects.some((item) => String(item.id) === requested)) onSelect(requested);
    } else if (selectedId && !projects.some((item) => String(item.id) === selectedId)) {
      onSelect(null);
    }
  }, [projects, selectedId, isLoading, isError, onSelect]);

  if (isLoading) return <div className="h-24 animate-pulse rounded-xl bg-muted/50" aria-label="Loading email projects" />;
  if (isError) return <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-muted-foreground">Project workspaces couldn't load.</p><Button variant="outline" onClick={() => refetch()}>Try again</Button></CardContent></Card>;

  return <Card className="border-primary/20">
    <CardContent className={project ? "flex flex-col gap-3 p-4 sm:flex-row sm:items-center" : "space-y-4 p-4 sm:p-6"}>
      <div className={project ? "flex min-w-0 flex-1 items-center gap-3" : "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><FolderKanban className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{project ? "Email workspace" : "Email projects"}</p>
            {project ? <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold">{project.name}</span>
              {project.legacy && <Badge variant="outline">Existing email setup</Badge>}
            </div> : <p className="mt-1 text-sm text-muted-foreground">Choose a project to manage its sending setup.</p>}
          </div>
        </div>
        {!project && <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Create project</Button>}
      </div>
      {project && projects.length > 0 && <div className="flex min-w-0 gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Select email project</span>
          <select className="h-9 w-full appearance-none rounded-md border bg-background py-1 pl-3 pr-8 text-sm" value={String(project.id)} onChange={(event) => onSelect(event.target.value)}>
            {projects.map((item) => <option key={item.id} value={String(item.id)}>{item.name}{item.legacy ? " · Existing email setup" : ""}</option>)}
          </select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
        </label>
        <Button variant="outline" size="icon" aria-label="Rename project" onClick={() => { setRename(project.name); setRenaming(true); }}><Pencil className="h-4 w-4" /></Button>
      </div>}
      {project && <Button variant="ghost" size="sm" onClick={() => onSelect(null)} className="whitespace-nowrap">Back to projects</Button>}
      {project && children}
      {project && <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New project</Button>}
      {!project && projects.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="email-project-list">
        {projects.map((item) => <Card key={item.id} className="border-border/60">
          <CardContent className="flex h-full flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><h2 className="break-words font-semibold">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">Created {new Date(item.createdAt).toLocaleDateString()}</p></div>
              {item.legacy && <Badge variant="outline" className="shrink-0">Existing email setup</Badge>}
            </div>
            <div className="flex gap-5 text-sm">
              <div><span className="font-semibold tabular-nums">{item.domainCount}</span><span className="ml-1.5 text-xs text-muted-foreground">domains</span></div>
              <div><span className="font-semibold tabular-nums">{item.keyCount}</span><span className="ml-1.5 text-xs text-muted-foreground">API keys</span></div>
            </div>
            <Button variant="outline" className="mt-auto w-full" onClick={() => onSelect(String(item.id))} data-testid={`button-manage-email-project-${item.id}`}>Manage project</Button>
          </CardContent>
        </Card>)}
      </div>}
      {!project && projects.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">No email projects yet</p><p className="mt-1 text-sm text-muted-foreground">Create a project to keep its sending domain, server keys, usage and logs together.</p>
      </div>}
      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setName(""); }}>
        <DialogContent><DialogHeader><DialogTitle>Create an email project</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2"><label htmlFor="email-project-name" className="text-sm font-medium">Project name</label><Input id="email-project-name" autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Customer receipts" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate(name.trim())}>{create.isPending ? "Creating…" : "Create project"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent><DialogHeader><DialogTitle>Rename email project</DialogTitle></DialogHeader><Input aria-label="Project name" maxLength={80} value={rename} onChange={(event) => setRename(event.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setRenaming(false)}>Cancel</Button><Button disabled={!project || !rename.trim() || update.isPending} onClick={() => project && update.mutate({ id: String(project.id), name: rename.trim() })}>Save name</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
