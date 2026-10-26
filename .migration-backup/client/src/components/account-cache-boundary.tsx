import { useSyncExternalStore, type ReactNode } from "react";
import { accountCacheGeneration, subscribeAccountCache } from "@/lib/queryClient";

/** Remounts local dialogs, drafts and observers when identity changes. */
export function AccountCacheBoundary({ children }: { children: ReactNode }) {
  const generation = useSyncExternalStore(subscribeAccountCache, accountCacheGeneration, accountCacheGeneration);
  return <div className="contents" key={generation}>{children}</div>;
}
