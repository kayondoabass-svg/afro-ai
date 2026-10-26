import { useQuery } from "@tanstack/react-query";
import type { Project, PublishedApp } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

const reconciledOwners = new Set<string>();
const reconciliationInFlight = new Map<string, Promise<{ failures?: number }>>();

export function reconcilePublishedApps(ownerId: string, retry = false) {
  if (retry) reconciledOwners.delete(ownerId);
  if (reconciledOwners.has(ownerId)) return Promise.resolve({ failures: 0 });
  const inFlight = reconciliationInFlight.get(ownerId);
  if (inFlight) return inFlight;
  const request = apiRequest("POST", "/api/projects/reconcile-published")
    .then((response) => response.json() as Promise<{ failures?: number }>)
    .then((result) => {
      reconciledOwners.add(ownerId);
      void queryClient.invalidateQueries({ queryKey: ["/api/app-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      return result;
    })
    .finally(() => reconciliationInFlight.delete(ownerId));
  reconciliationInFlight.set(ownerId, request);
  return request;
}

export interface AppLibraryEntry {
  key: string;
  project: Project | null;
  conversationId: number | null;
  publishedApps: PublishedApp[];
}

export interface AppLibraryResponse {
  apps: AppLibraryEntry[];
}

export function useAppHandoff() {
  const params = new URLSearchParams(window.location.search);
  const projectIdParam = params.get("projectId");
  const appIdParam = params.get("appId") || params.get("app");
  const projectId = projectIdParam ? Number(projectIdParam) : null;
  const appId = appIdParam ? Number(appIdParam) : null;
  const hasContext = !!projectIdParam || !!appIdParam;

  const library = useQuery<AppLibraryResponse>({
    queryKey: ["/api/app-library"],
    enabled: hasContext,
  });
  const entries = library.data?.apps || [];
  const entry = entries.find((item) =>
    (appId ? item.publishedApps.some((app) => app.id === appId) : true) &&
    (projectId ? item.project?.id === projectId : true)
  );
  const selectedApp = entry?.publishedApps.find((app) => app.id === appId) ||
    (!appId && entry?.publishedApps.length === 1 ? entry.publishedApps[0] : undefined);
  const valid = !hasContext || (!!entry && (!appId || (!!selectedApp && !!entry.project)));
  const hostname = selectedApp
    ? selectedApp.customDomain && selectedApp.customDomainVerified
      ? selectedApp.customDomain
      : `${selectedApp.subdomain}.afroaigroup.com`
    : undefined;

  return {
    hasContext,
    isLoading: hasContext && library.isLoading,
    isError: library.isError,
    error: library.error,
    entry,
    project: entry?.project || null,
    app: selectedApp,
    hostname,
    valid,
    retry: library.refetch,
  };
}
