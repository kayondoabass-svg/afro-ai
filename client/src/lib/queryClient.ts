import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = (import.meta.env.VITE_API_URL as string) || "";

// Inspect every AI response for quota headers / 429 body and dispatch a
// global window event. The <QuotaNotifications> provider listens and shows
// a soft toast at 80% or a blocking modal at 100%.
function inspectQuota(res: Response, bodyText?: string): void {
  try {
    const kind = res.headers.get("X-AfroAI-Quota-Kind");
    if (!kind) return;
    const used = Number(res.headers.get("X-AfroAI-Quota-Used") || 0);
    const limit = Number(res.headers.get("X-AfroAI-Quota-Limit") || 0);
    const percent = Number(res.headers.get("X-AfroAI-Quota-Percent") || 0);
    const plan = res.headers.get("X-AfroAI-Quota-Plan") || "starter";
    const resetsAt = res.headers.get("X-AfroAI-Quota-Resets-At") || "";

    if (res.status === 429 && bodyText) {
      let body: any = {};
      try { body = JSON.parse(bodyText); } catch { /* ignore */ }
      if (body?.code === "DAILY_QUOTA_REACHED") {
        window.dispatchEvent(new CustomEvent("afroai:quota-blocked", { detail: { ...body, kind, used, limit, plan, resetsAt } }));
        return;
      }
    }
    if (percent >= 80 && percent < 100) {
      window.dispatchEvent(new CustomEvent("afroai:quota-warn", { detail: { kind, used, limit, percent, plan, resetsAt } }));
    }
  } catch { /* never let header parsing break a request */ }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    inspectQuota(res, text);
    throw new Error(`${res.status}: ${text}`);
  }
  inspectQuota(res);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    const fullUrl = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const res = await fetch(fullUrl, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
