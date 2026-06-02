import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep TCP connections alive so the OS/network doesn't silently drop idle
  // sockets, which is a common cause of "Connection terminated unexpectedly".
  keepAlive: true,
});

// An idle client in the pool can be dropped by the database (idle timeout,
// network blip, DB restart). pg emits 'error' on that idle client; without a
// listener the event becomes an uncaught exception and crashes the process.
// Log it and let the pool discard the dead client — the next query transparently
// acquires a fresh connection. This does NOT swallow per-query errors (those
// still reject on their own promise as usual).
pool.on("error", (err) => {
  console.error("[db] idle pool client error (recovered):", err.message);
});

export const db = drizzle(pool, { schema });
