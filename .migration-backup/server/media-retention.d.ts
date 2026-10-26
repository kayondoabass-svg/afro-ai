import type {Pool} from "pg";
export interface MediaExpiryFields {
  expires_at?: Date | string | null;
  expired_at?: Date | string | null;
}
export function isMediaExpired(row: MediaExpiryFields, now?: number): boolean;
export function removePrivateMedia(key: string): Promise<void>;
export function purgeExpiredMedia(db: Pick<Pool, "connect">, options?: {
  limit?: number;
  remove?: (key: string) => Promise<void>;
}): Promise<{purged: number; retry: number}>;
