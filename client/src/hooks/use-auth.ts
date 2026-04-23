import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  // Auth lives in the Cloudflare Worker (afroaigroup.com/cf-auth/*) — that's
  // where the session cookie is set on login. The legacy Express /api/auth/user
  // endpoint doesn't see the worker's cookie and was bouncing logged-in users
  // back to the home page.
  const response = await fetch("/cf-auth/me", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data?.user ?? null;
}

async function logout(): Promise<void> {
  try {
    await fetch("/cf-auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // best-effort — fall through and reload to clear client state regardless
  }
  window.location.href = "/";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
