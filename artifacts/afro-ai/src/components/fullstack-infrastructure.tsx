import { useId, useState } from "react";
import { Database, ShieldAlert, ServerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFullstackInfrastructure } from "@/hooks/use-fullstack-infrastructure";
import { isSetupBlocked, projectRequestError } from "@/lib/fullstack-project";
import type { Project } from "@shared/schema";

const statusLabels = {
  not_provisioned: "Not provisioned",
  provisioning: "Provisioning database…",
  ready: "Database ready",
  failed: "Database operation failed",
  deleting: "Deleting database…",
  deleted: "Database deleted",
};

export function FullstackInfrastructure({ project }: { project: Pick<Project, "id" | "name" | "type" | "status"> }) {
  const { query, provision, remove } = useFullstackInfrastructure(project.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const confirmationId = useId();
  const data = query.data;
  const busy = provision.isPending || remove.isPending;
  // Never infer paid access from a plan label or stale/error query data.
  const verified = query.isSuccess && !query.isError && !query.isFetching && !!data;
  const canProvision = verified && data.canProvision === true && data.configured === true &&
    !isSetupBlocked(project) && !busy && ["not_provisioned", "deleted", "failed", "provisioning"].includes(data.state);
  // Deletion deliberately does not require paid access or platform provisioning configuration.
  const canDelete = verified && !!data.databaseName && !busy && !["deleted", "deleting"].includes(data.state);
  const mutationError = remove.error || provision.error;

  return (
    <section aria-label="Full-stack infrastructure" className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-4 text-sm" data-testid="fullstack-infrastructure">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary shrink-0" />
          <h3 className="font-semibold">Database infrastructure</h3>
        </div>
        {data && !query.isError && <Badge variant="secondary" role="status">{statusLabels[data.state]}</Badge>}
      </div>
      {query.isPending ? (
        <div aria-label="Loading infrastructure" className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-full" /></div>
      ) : query.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">Could not verify infrastructure. {projectRequestError(query.error).message}</p>
          <p className="text-xs text-muted-foreground">Access is checked by the server. No database actions are available until this check succeeds.</p>
          <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry status check</Button>
        </div>
      ) : data ? (
        <>
          <div className="space-y-2">
            {data.databaseName && <p className="break-all font-mono text-xs">{data.databaseName}</p>}
            <p className="text-xs text-muted-foreground">Migrations applied: {data.migrationsApplied} · Limits: {data.limits.databasesPerUser} databases per user, {data.limits.provisionsPerDay} provisions per day.</p>
            {data.state === "ready" && <p>Only your D1 database is ready. Your app is not running or live.</p>}
            {data.state === "provisioning" && <p className="text-xs text-muted-foreground">Checking every 3 seconds. If setup stalls, retry on this project; a busy server may return 409 and ask you to wait.</p>}
            {data.state === "deleting" && <p role="status">Permanent database deletion is in progress. Checking every 3 seconds; source files are retained.</p>}
            {data.state === "deleted" && <p>Database deleted. Existing project source files are retained.</p>}
            {data.lastError && <p role="alert" className="text-destructive break-words">{data.lastError}</p>}
             {(!data.configured || data.canProvision !== true) && <p className="text-xs text-muted-foreground">Managed database provisioning is deferred. New provisioning is unavailable; existing database status and deletion controls remain available.</p>}
            {isSetupBlocked(project) && <p className="text-xs text-muted-foreground">Complete starter setup using Retry setup on the dashboard before provisioning.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {["not_provisioned", "deleted", "failed", "provisioning"].includes(data.state) &&
              <Button size="sm" disabled={!canProvision} onClick={() => { remove.reset(); provision.mutate(); }}>
                {provision.isPending ? "Requesting provisioning…" : ["failed", "provisioning"].includes(data.state) ? "Retry provisioning" : "Provision database"}
              </Button>}
            {data.databaseName && !["deleted", "deleting"].includes(data.state) &&
              <Button size="sm" variant="outline" disabled={!canDelete} onClick={() => { setConfirmOpen(true); setConfirmation(""); provision.reset(); remove.reset(); }}>Delete database</Button>}
          </div>
          {confirmOpen && data.state !== "deleted" && data.state !== "deleting" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-3">
              <p className="font-semibold text-destructive flex items-center gap-2"><ShieldAlert className="w-4 h-4 shrink-0" />Permanent data loss</p>
              <p className="text-xs">This permanently deletes the database and all stored data. This cannot be undone. Existing source code is retained, but it does not restore your data.</p>
              <label htmlFor={confirmationId} className="block text-xs">Type the exact project name to confirm: <strong className="break-all">{project.name}</strong></label>
              <Input id={confirmationId} autoComplete="off" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" disabled={!canDelete || confirmation !== project.name} onClick={() => remove.mutate(confirmation)}>
                  {remove.isPending ? "Requesting deletion…" : "Permanently delete database"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setConfirmOpen(false); setConfirmation(""); remove.reset(); }}>Cancel</Button>
              </div>
            </div>
          )}
        </>
      ) : null}
      {mutationError && <p role="alert" className="text-destructive break-words">{projectRequestError(mutationError).message} No successful completion has been confirmed; check the status before retrying.</p>}
      <div className="border-t border-primary/15 pt-3 space-y-2 text-xs text-muted-foreground">
         <p>Source is saved separately from database infrastructure. Existing D1 operations and storage may be billed to the platform.</p>
         <p className="flex items-center gap-2 font-medium"><ServerOff className="w-4 h-4 shrink-0" />Managed provisioning and hosting deferred</p>
         <p>Static Publish cannot deploy a working full-stack app. Ordinary websites continue to publish at *.afroaigroup.com.</p>
         <p>Export source to GitHub, review the changed files and confirm the commit. GitHub stores code; it does not host Workers or provision D1. Deploy externally with your own hosting and database accounts. No separate domain is required to export.</p>
      </div>
    </section>
  );
}