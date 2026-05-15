import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/cf-auth/me", {
    credentials: "include",
    cache: "no-store",
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
  // 1. Tell the Worker to clear the httpOnly session cookie.
  try {
    await fetch("/cf-auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    /* best-effort — keep going so client state is cleared even if request fails */
  }

  // 2. Wipe every cache the PWA service worker may have stored.
  // Without this the installed app silently re-renders the previous logged-in
  // shell on the next navigation and the user "comes back" logged in.
  try {
    if (typeof window !== "undefined" && "caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  // 3. Unregister all service workers so a stale SW can't re-serve the old app.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }

  // 4. Clear any non-httpOnly cookies and local/session storage.
  try {
    if (typeof window !== "undefined") {
      sessionStorage.clear();
      localStorage.removeItem("after_login_redirect");
      const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie.split(";").forEach((c) => {
        const eq = c.indexOf("=");
        const name = (eq > -1 ? c.substring(0, eq) : c).trim();
        if (!name) return;
        ["/", ""].forEach((path) => {
          document.cookie = `${name}=; ${expire}; path=${path || "/"}`;
          document.cookie = `${name}=; ${expire}; path=${path || "/"}; domain=afroaigroup.com`;
          document.cookie = `${name}=; ${expire}; path=${path || "/"}; domain=.afroaigroup.com`;
        });
      });
    }
  } catch {
    /* ignore */
  }

  // 5. Hard navigation with a cache-busting query string. `replace` so the
  //    user can't tap "back" to land on a stale logged-in page.
  if (typeof window !== "undefined") {
    window.location.replace(`/login?ts=${Date.now()}`);
  }
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
      queryClient.clear();
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
