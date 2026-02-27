export * from "./models/auth";
export * from "./models/chat";

import { pgTable, serial, text, timestamp, varchar, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { users } from "./models/auth";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("website"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const publishedApps = pgTable("published_apps", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  subdomain: varchar("subdomain").notNull().unique(),
  htmlContent: text("html_content").notNull(),
  title: text("title").notNull(),
  cloudflareDnsRecordId: varchar("cloudflare_dns_record_id"),
  appStatus: varchar("app_status").notNull().default("active"),
  suspendedAt: timestamp("suspended_at"),
  suspendReason: text("suspend_reason"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPublishedAppSchema = createInsertSchema(publishedApps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PublishedApp = typeof publishedApps.$inferSelect;
export type InsertPublishedApp = z.infer<typeof insertPublishedAppSchema>;

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: varchar("referrer_id").notNull().references(() => users.id),
  referredId: varchar("referred_id").notNull().references(() => users.id),
  status: varchar("status").notNull().default("signed_up"),
  commissionAmount: integer("commission_amount").notNull().default(0),
  paidPlan: varchar("paid_plan"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;
