import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  plan: varchar("plan").notNull().default("starter"),
  referralCode: varchar("referral_code").unique(),
  referredBy: varchar("referred_by"),
  referralCredit: integer("referral_credit").notNull().default(0),
  // Pay-as-you-go credits (stored in cents, e.g. 500 = $5.00)
  paygBalance: integer("payg_balance").notNull().default(0),
  paygLimit: integer("payg_limit").notNull().default(1000), // default $10 limit
  paygSpent: integer("payg_spent").notNull().default(0),
  // Free trial tracking
  freeTrialStarted: timestamp("free_trial_started"),
  // Experience level — asked once, determines AI behaviour mode
  experienceLevel: varchar("experience_level"), // 'beginner' | 'intermediate' | 'expert'
  // Preferred UI language code (en, sw, ar, fr, etc.) — synced from client localStorage
  preferredLanguage: varchar("preferred_language", { length: 8 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Password reset tokens — single-use, expire after 1 hour
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    tokenHash: varchar("token_hash").primaryKey(),
    userId: varchar("user_id").notNull(),
    email: varchar("email").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("IDX_password_reset_user").on(table.userId)]
);
