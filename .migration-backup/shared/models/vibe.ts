import { pgTable, serial, integer, text, timestamp, varchar, boolean, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { messages } from "./chat";

export const vibeSteps = pgTable("vibe_steps", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  ord: integer("ord").notNull().default(0),
  kind: varchar("kind", { length: 32 }).notNull(),
  label: text("label").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("done"),
  fileRef: text("file_ref"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const vibeFileRefs = pgTable("vibe_file_refs", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  startLine: integer("start_line"),
  endLine: integer("end_line"),
  preview: text("preview"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertVibeStepSchema = createInsertSchema(vibeSteps).omit({ id: true, createdAt: true });
export const insertVibeFileRefSchema = createInsertSchema(vibeFileRefs).omit({ id: true, createdAt: true });
export type VibeStep = typeof vibeSteps.$inferSelect;
export type VibeFileRef = typeof vibeFileRefs.$inferSelect;
export type InsertVibeStep = z.infer<typeof insertVibeStepSchema>;
export type InsertVibeFileRef = z.infer<typeof insertVibeFileRefSchema>;
