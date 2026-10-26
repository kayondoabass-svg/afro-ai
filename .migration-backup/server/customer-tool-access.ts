import { sql } from "drizzle-orm";
import { db } from "./db";
import { insertMarketplaceListingSchema } from "@shared/schema";

// Client-supplied listing updates must never change ownership or system counters.
export const customerListingSchema = insertMarketplaceListingSchema.omit({ userId: true, downloads: true }).strict();
export async function removeOwnedCollaborator(id: number, owner: string): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id < 1) return false;
  const result = await db.execute(sql`DELETE FROM project_collaborators
    WHERE id = ${id} AND project_id IN (SELECT id FROM projects WHERE user_id = ${owner})
    RETURNING id`);
  return result.rows.length > 0;
}