import { db } from "./db";
import { projects, publishedApps, referrals, type Project, type InsertProject, type PublishedApp, type InsertPublishedApp, type Referral, type InsertReferral } from "@shared/schema";
import { users } from "@shared/models/auth";
import { conversations, messages } from "@shared/models/chat";
import { eq, desc, sql, count, and } from "drizzle-orm";
import crypto from "crypto";

export interface IStorage {
  getProjectsByUser(userId: string): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  getPublishedAppBySubdomain(subdomain: string): Promise<PublishedApp | undefined>;
  getPublishedAppsByUser(userId: string): Promise<PublishedApp[]>;
  createPublishedApp(app: InsertPublishedApp): Promise<PublishedApp>;
  updatePublishedApp(id: number, data: Partial<InsertPublishedApp>): Promise<PublishedApp>;
  deletePublishedApp(id: number): Promise<void>;
  getAllUsers(): Promise<any[]>;
  getAllProjects(): Promise<any[]>;
  getAllPublishedApps(): Promise<any[]>;
  getPlatformStats(): Promise<{
    totalUsers: number;
    totalProjects: number;
    totalPublishedApps: number;
    totalConversations: number;
    totalMessages: number;
    recentUsers: any[];
    recentProjects: any[];
    recentPublishedApps: any[];
  }>;
  getUserReferralCode(userId: string): Promise<string>;
  getUserByReferralCode(code: string): Promise<any | undefined>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  getReferralsByReferrer(referrerId: string): Promise<Referral[]>;
  updateReferralStatus(referredId: string, status: string, commissionAmount: number, paidPlan: string): Promise<void>;
  addReferralCredit(userId: string, amount: number): Promise<void>;
  getUserReferralStats(userId: string): Promise<{ totalReferrals: number; paidReferrals: number; totalEarnings: number; credit: number }>;
}

class DatabaseStorage implements IStorage {
  async getProjectsByUser(userId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getPublishedAppBySubdomain(subdomain: string): Promise<PublishedApp | undefined> {
    const [app] = await db.select().from(publishedApps).where(eq(publishedApps.subdomain, subdomain));
    return app;
  }

  async getPublishedAppsByUser(userId: string): Promise<PublishedApp[]> {
    return db.select().from(publishedApps).where(eq(publishedApps.userId, userId)).orderBy(desc(publishedApps.createdAt));
  }

  async createPublishedApp(app: InsertPublishedApp): Promise<PublishedApp> {
    const [created] = await db.insert(publishedApps).values(app).returning();
    return created;
  }

  async updatePublishedApp(id: number, data: Partial<InsertPublishedApp>): Promise<PublishedApp> {
    const [updated] = await db.update(publishedApps).set({ ...data, updatedAt: new Date() }).where(eq(publishedApps.id, id)).returning();
    return updated;
  }

  async deletePublishedApp(id: number): Promise<void> {
    await db.delete(publishedApps).where(eq(publishedApps.id, id));
  }

  async getAllUsers(): Promise<any[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllProjects(): Promise<any[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getAllPublishedApps(): Promise<any[]> {
    return db.select().from(publishedApps).orderBy(desc(publishedApps.createdAt));
  }

  async getPlatformStats() {
    const [userCount] = await db.select({ value: count() }).from(users);
    const [projectCount] = await db.select({ value: count() }).from(projects);
    const [publishedCount] = await db.select({ value: count() }).from(publishedApps);
    const [convoCount] = await db.select({ value: count() }).from(conversations);
    const [msgCount] = await db.select({ value: count() }).from(messages);

    const recentUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(10);
    const recentProjects = await db.select().from(projects).orderBy(desc(projects.createdAt)).limit(10);
    const recentPublishedApps = await db.select().from(publishedApps).orderBy(desc(publishedApps.createdAt)).limit(10);

    return {
      totalUsers: userCount.value,
      totalProjects: projectCount.value,
      totalPublishedApps: publishedCount.value,
      totalConversations: convoCount.value,
      totalMessages: msgCount.value,
      recentUsers,
      recentProjects,
      recentPublishedApps,
    };
  }
  async getUserReferralCode(userId: string): Promise<string> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.referralCode) return user.referralCode;
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
    return code;
  }

  async getUserByReferralCode(code: string): Promise<any | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user;
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    if (referral.referrerId === referral.referredId) {
      throw new Error("Cannot refer yourself");
    }
    const existing = await db.select().from(referrals).where(eq(referrals.referredId, referral.referredId));
    if (existing.length > 0) {
      return existing[0];
    }
    const [created] = await db.insert(referrals).values(referral).returning();
    return created;
  }

  async getReferralsByReferrer(referrerId: string): Promise<Referral[]> {
    return db.select().from(referrals).where(eq(referrals.referrerId, referrerId)).orderBy(desc(referrals.createdAt));
  }

  async updateReferralStatus(referredId: string, status: string, commissionAmount: number, paidPlan: string): Promise<void> {
    await db.update(referrals).set({ status, commissionAmount, paidPlan }).where(eq(referrals.referredId, referredId));
  }

  async addReferralCredit(userId: string, amount: number): Promise<void> {
    await db.update(users).set({ referralCredit: sql`referral_credit + ${amount}` }).where(eq(users.id, userId));
  }

  async getUserReferralStats(userId: string): Promise<{ totalReferrals: number; paidReferrals: number; totalEarnings: number; credit: number }> {
    const allReferrals = await this.getReferralsByReferrer(userId);
    const paidReferrals = allReferrals.filter(r => r.status === "paid");
    const totalEarnings = paidReferrals.reduce((sum, r) => sum + (r.commissionAmount || 0), 0);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return {
      totalReferrals: allReferrals.length,
      paidReferrals: paidReferrals.length,
      totalEarnings,
      credit: user?.referralCredit || 0,
    };
  }
}

export const storage = new DatabaseStorage();
