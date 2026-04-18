import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export const FOUNDER_EMAILS = ["kayondoabass@gmail.com"];

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const isFounderEmail = FOUNDER_EMAILS.includes(userData.email || "");

    if (userData.email) {
      const [existingByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email));

      if (existingByEmail) {
        const updateData: any = {
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        };
        // Always keep founder on business plan
        if (isFounderEmail) updateData.plan = "business";

        const [updated] = await db
          .update(users)
          .set(updateData)
          .where(eq(users.email, userData.email))
          .returning();
        return updated;
      }
    }

    const insertData: any = { ...userData };
    if (isFounderEmail) insertData.plan = "business";

    const [user] = await db
      .insert(users)
      .values(insertData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          plan: isFounderEmail ? "business" : undefined,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Welcome email — best-effort, only on truly new accounts (created within last few seconds)
    try {
      if (!isFounderEmail && user.email && user.createdAt) {
        const ageMs = Date.now() - new Date(user.createdAt).getTime();
        if (ageMs < 30_000) {
          const { sendWelcomeEmail } = await import("../../mailer");
          sendWelcomeEmail(user.email, user.firstName || user.email.split("@")[0]).catch(() => {});
        }
      }
    } catch {}

    return user;
  }
}

export const authStorage = new AuthStorage();
