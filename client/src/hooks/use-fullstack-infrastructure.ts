import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface InfrastructureView {
  state: "not_provisioned" | "provisioning" | "ready" | "failed" | "deleting" | "deleted";
  databaseName: string | null;
  lastError: string | null;
  migrationsApplied: number;
  canProvision: boolean;
  configured: boolean;
  limits: { databasesPerUser: number; provisionsPerDay: number };
  hosting: { available: false; reason: string };
}

export const infrastructureKey = (projectId: number) => ["/api/projects", projectId, "infrastructure"] as const;
export const infrastructurePollInterval = (view?: InfrastructureView) =>
  view?.state === "provisioning" || view?.state === "deleting" ? 3000 : false;

export function useFullstackInfrastructure(projectId: number) {
  const client = useQueryClient();
  const url = `/api/projects/${projectId}/infrastructure`;
  const query = useQuery<InfrastructureView>({
    queryKey: infrastructureKey(projectId),
    queryFn: async () => (await apiRequest("GET", url)).json(),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: query => infrastructurePollInterval(query.state.data),
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: infrastructureKey(projectId) });
    // Files are keyed by conversation, not project; refresh all mounted file views.
    void client.invalidateQueries({ queryKey: ["/api/d1/project-files"] });
  };
  const provision = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${url}/provision`, {})).json() as Promise<InfrastructureView>,
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (confirmation: string) => (
      await apiRequest("POST", `${url}/delete`, { confirmation })
    ).json() as Promise<InfrastructureView>,
    onSettled: invalidate,
  });
  const previous = useRef<{ id: number; state: InfrastructureView["state"] } | null>(null);
  useEffect(() => {
    const state = query.data?.state;
    if (!state) return;
    if (previous.current?.id === projectId && previous.current.state !== state && (state === "ready" || state === "deleted")) {
      void client.invalidateQueries({ queryKey: ["/api/d1/project-files"] });
    }
    previous.current = { id: projectId, state };
  }, [query.data?.state, projectId, client]);
  return { query, provision, remove };
}