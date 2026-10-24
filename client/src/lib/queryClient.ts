import { QueryClient, QueryFunction, MutationCache, hashKey } from "@tanstack/react-query";
import { DailyQuotaError, inspectQuota } from "./quota-response";
export { DailyQuotaError, inspectQuota } from "./quota-response";

const API_BASE = (import.meta.env.VITE_API_URL as string) || "";
let accountId: string | null | undefined;
let generation = 0;
let suppressBroadcast = false;
const listeners = new Set<() => void>();
export const accountCacheGeneration = () => generation;
export const subscribeAccountCache = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const isAuth = (key: readonly unknown[]) => key[0] === "/api/auth/user";

/** No private cache or late response may cross an identity transition. */
export function replaceAccountCache(user: { id: string } | null, broadcast = true) {
  const next = user?.id ?? null;
  if (next === accountId) return;
  accountId = next;
  generation++;
  void queryClient.cancelQueries({ predicate: query => !isAuth(query.queryKey) });
  queryClient.removeQueries({ predicate: query => !isAuth(query.queryKey) });
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(["/api/auth/user"], user);
  listeners.forEach(listener => listener());
  if (broadcast && !suppressBroadcast && typeof localStorage !== "undefined") {
    try { localStorage.setItem("afro-account-changed", `${Date.now()}-${Math.random()}`); } catch { /* unavailable storage */ }
  }
  if (broadcast) suppressBroadcast = false;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", event => {
    if (event.key !== "afro-account-changed") return;
    suppressBroadcast = true;
    replaceAccountCache(null, false);
    void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  });
}

function assertCurrentGeneration(started: number) {
  if (started !== generation) throw new DOMException("Account changed; response discarded.", "AbortError");
}

// Inspect every AI response for quota headers / 429 body and dispatch a
// global window event. The <QuotaNotifications> provider listens and shows
// a soft toast at 80% or a blocking modal at 100%.
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (inspectQuota(res, text)) throw new DailyQuotaError(text);
    throw new Error(`${res.status}: ${text}`);
  }
  inspectQuota(res);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  requestHeaders?: Record<string, string>,
): Promise<Response> {
  const started = generation;
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...requestHeaders },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  assertCurrentGeneration(started);
  if (res.status === 401) replaceAccountCache(null);
  await throwIfResNotOk(res);
  assertCurrentGeneration(started);
  const originalJson = res.json.bind(res);
  res.json = async () => {
    const body = await originalJson();
    assertCurrentGeneration(started);
    return body;
  };
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const started = generation;
    const path = queryKey.join("/") as string;
    const fullUrl = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const res = await fetch(fullUrl, {
      credentials: "include",
      signal,
      cache: "no-store",
    });
    assertCurrentGeneration(started);
    if (res.status === 401) replaceAccountCache(null);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const body = await res.json();
    assertCurrentGeneration(started);
    return body;
  };

const mutationGenerations = new WeakMap<object, number>();
function discardStaleMutationCallbacks(mutation: any) {
  if (mutationGenerations.get(mutation) !== generation) {
    mutation.setOptions({ ...mutation.options, onSuccess: undefined, onError: undefined, onSettled: undefined });
  }
}
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onMutate: (_variables, mutation) => { mutationGenerations.set(mutation, generation); },
    onSuccess: (_data, _variables, _context, mutation) => { discardStaleMutationCallbacks(mutation); },
    onError: (_error, _variables, _context, mutation) => { discardStaleMutationCallbacks(mutation); },
  }),
  defaultOptions: {
    queries: {
      queryKeyHashFn: key => hashKey(isAuth(key) ? key : [accountId ?? null, ...key]),
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
