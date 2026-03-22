import { db } from "./db";
import { projects, publishedApps, publishedAppVersions, referrals, payments, usageLogs, forms, formSubmissions, blogPosts, emailSubscribers, emailCampaigns, type Project, type InsertProject, type PublishedApp, type InsertPublishedApp, type PublishedAppVersion, type Referral, type InsertReferral, type Payment, type InsertPayment, type UsageLog, type InsertUsageLog, type Form, type InsertForm, type FormSubmission, type InsertFormSubmission, type BlogPost, type InsertBlogPost, type EmailSubscriber, type InsertEmailSubscriber, type EmailCampaign, type InsertEmailCampaign } from "@shared/schema";
import { users } from "@shared/models/auth";
import { conversations, messages } from "@shared/models/chat";
import { eq, desc, sql, count, and, gte } from "drizzle-orm";
import crypto from "crypto";

export interface IStorage {
  getProjectsByUser(userId: string): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  getPublishedAppBySubdomain(subdomain: string): Promise<PublishedApp | undefined>;
  getPublishedAppByCustomDomain(customDomain: string): Promise<PublishedApp | undefined>;
  getPublishedAppsByUser(userId: string): Promise<PublishedApp[]>;
  createPublishedApp(app: InsertPublishedApp): Promise<PublishedApp>;
  updatePublishedApp(id: number, data: Partial<InsertPublishedApp>): Promise<PublishedApp>;
  deletePublishedApp(id: number): Promise<void>;
  suspendPublishedApp(id: number, reason: string): Promise<PublishedApp>;
  reactivatePublishedApp(id: number): Promise<PublishedApp>;
  suspendAppsByUser(userId: string, reason: string): Promise<void>;
  reactivateAppsByUser(userId: string): Promise<void>;
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
  updateUserPlan(userId: string, plan: string): Promise<void>;
  getUser(userId: string): Promise<any | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePaymentByMerchantRef(merchantRef: string, data: Partial<InsertPayment>): Promise<Payment | undefined>;
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  getPaymentById(id: number): Promise<Payment | undefined>;
  getPaymentByMerchantRef(merchantRef: string): Promise<Payment | undefined>;
  createUsageLog(log: InsertUsageLog): Promise<UsageLog>;
  getUsageByUser(userId: string): Promise<UsageLog[]>;
  getUsageStatsByUser(userId: string): Promise<{ totalGenerations: number; totalTokens: number; dailyUsage: { date: string; generations: number; tokens: number }[] }>;
  getFormsByUser(userId: string): Promise<Form[]>;
  getForm(id: number): Promise<Form | undefined>;
  createForm(form: InsertForm): Promise<Form>;
  updateForm(id: number, data: Partial<InsertForm>): Promise<Form>;
  deleteForm(id: number): Promise<void>;
  createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission>;
  getFormSubmissions(formId: number): Promise<FormSubmission[]>;
  deleteFormSubmission(id: number): Promise<void>;
  getFormSubmissionCount(formId: number): Promise<number>;
  createAppVersion(publishedAppId: number, htmlContent: string, title: string, reason: string): Promise<PublishedAppVersion>;
  getAppVersions(publishedAppId: number): Promise<PublishedAppVersion[]>;
  getAppVersion(id: number): Promise<PublishedAppVersion | undefined>;
  restoreAppVersion(publishedAppId: number, versionId: number): Promise<PublishedApp>;
  deleteOldVersions(publishedAppId: number, keepCount: number): Promise<void>;
  // Blog
  getBlogPostsByUser(userId: string): Promise<BlogPost[]>;
  getBlogPost(id: number): Promise<BlogPost | undefined>;
  createBlogPost(post: InsertBlogPost): Promise<BlogPost>;
  updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<BlogPost>;
  deleteBlogPost(id: number): Promise<void>;
  // Email Marketing
  getEmailSubscribersByUser(userId: string): Promise<EmailSubscriber[]>;
  addEmailSubscriber(sub: InsertEmailSubscriber): Promise<EmailSubscriber>;
  updateEmailSubscriberStatus(id: number, status: string): Promise<void>;
  deleteEmailSubscriber(id: number): Promise<void>;
  getEmailCampaignsByUser(userId: string): Promise<EmailCampaign[]>;
  getEmailCampaign(id: number): Promise<EmailCampaign | undefined>;
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  updateEmailCampaign(id: number, data: Partial<InsertEmailCampaign>): Promise<EmailCampaign>;
  deleteEmailCampaign(id: number): Promise<void>;
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

  async getPublishedAppByCustomDomain(customDomain: string): Promise<PublishedApp | undefined> {
    const [app] = await db.select().from(publishedApps).where(
      and(eq(publishedApps.customDomain, customDomain), eq(publishedApps.customDomainVerified, true))
    );
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

  async suspendPublishedApp(id: number, reason: string): Promise<PublishedApp> {
    const [updated] = await db.update(publishedApps).set({
      appStatus: "suspended",
      suspendedAt: new Date(),
      suspendReason: reason,
      updatedAt: new Date(),
    }).where(eq(publishedApps.id, id)).returning();
    return updated;
  }

  async reactivatePublishedApp(id: number): Promise<PublishedApp> {
    const [updated] = await db.update(publishedApps).set({
      appStatus: "active",
      suspendedAt: null,
      suspendReason: null,
      updatedAt: new Date(),
    }).where(eq(publishedApps.id, id)).returning();
    return updated;
  }

  async suspendAppsByUser(userId: string, reason: string): Promise<void> {
    await db.update(publishedApps).set({
      appStatus: "suspended",
      suspendedAt: new Date(),
      suspendReason: reason,
      updatedAt: new Date(),
    }).where(and(eq(publishedApps.userId, userId), eq(publishedApps.appStatus, "active")));
  }

  async reactivateAppsByUser(userId: string): Promise<void> {
    await db.update(publishedApps).set({
      appStatus: "active",
      suspendedAt: null,
      suspendReason: null,
      updatedAt: new Date(),
    }).where(and(eq(publishedApps.userId, userId), eq(publishedApps.appStatus, "suspended")));
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
  async updateUserPlan(userId: string, plan: string): Promise<void> {
    await db.update(users).set({ plan, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async getUser(userId: string): Promise<any | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
  }

  async updatePaymentByMerchantRef(merchantRef: string, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [updated] = await db.update(payments).set(data).where(eq(payments.merchantReference, merchantRef)).returning();
    return updated;
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt));
  }

  async getPaymentById(id: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async getPaymentByMerchantRef(merchantRef: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.merchantReference, merchantRef));
    return payment;
  }

  async createUsageLog(log: InsertUsageLog): Promise<UsageLog> {
    const [created] = await db.insert(usageLogs).values(log).returning();
    return created;
  }

  async getUsageByUser(userId: string): Promise<UsageLog[]> {
    return db.select().from(usageLogs).where(eq(usageLogs.userId, userId)).orderBy(desc(usageLogs.createdAt));
  }

  async getUsageStatsByUser(userId: string): Promise<{ totalGenerations: number; totalTokens: number; dailyUsage: { date: string; generations: number; tokens: number }[] }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await db.select().from(usageLogs)
      .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, thirtyDaysAgo)))
      .orderBy(desc(usageLogs.createdAt));

    const totalGenerations = logs.length;
    const totalTokens = logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0);

    const dailyMap = new Map<string, { generations: number; tokens: number }>();
    for (const log of logs) {
      const dateKey = log.createdAt.toISOString().split("T")[0];
      const existing = dailyMap.get(dateKey) || { generations: 0, tokens: 0 };
      existing.generations++;
      existing.tokens += log.tokensUsed || 0;
      dailyMap.set(dateKey, existing);
    }

    const dailyUsage = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    })).sort((a, b) => a.date.localeCompare(b.date));

    return { totalGenerations, totalTokens, dailyUsage };
  }

  async getFormsByUser(userId: string): Promise<Form[]> {
    return db.select().from(forms).where(eq(forms.userId, userId)).orderBy(desc(forms.createdAt));
  }

  async getForm(id: number): Promise<Form | undefined> {
    const [form] = await db.select().from(forms).where(eq(forms.id, id));
    return form;
  }

  async createForm(form: InsertForm): Promise<Form> {
    const [created] = await db.insert(forms).values(form).returning();
    return created;
  }

  async updateForm(id: number, data: Partial<InsertForm>): Promise<Form> {
    const [updated] = await db.update(forms).set({ ...data, updatedAt: new Date() }).where(eq(forms.id, id)).returning();
    return updated;
  }

  async deleteForm(id: number): Promise<void> {
    await db.delete(formSubmissions).where(eq(formSubmissions.formId, id));
    await db.delete(forms).where(eq(forms.id, id));
  }

  async createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission> {
    const [created] = await db.insert(formSubmissions).values(submission).returning();
    return created;
  }

  async getFormSubmissions(formId: number): Promise<FormSubmission[]> {
    return db.select().from(formSubmissions).where(eq(formSubmissions.formId, formId)).orderBy(desc(formSubmissions.createdAt));
  }

  async deleteFormSubmission(id: number): Promise<void> {
    await db.delete(formSubmissions).where(eq(formSubmissions.id, id));
  }

  async getFormSubmissionCount(formId: number): Promise<number> {
    const [result] = await db.select({ value: count() }).from(formSubmissions).where(eq(formSubmissions.formId, formId));
    return result?.value ?? 0;
  }

  async createAppVersion(publishedAppId: number, htmlContent: string, title: string, reason: string): Promise<PublishedAppVersion> {
    const versions = await db.select({ versionNumber: publishedAppVersions.versionNumber })
      .from(publishedAppVersions)
      .where(eq(publishedAppVersions.publishedAppId, publishedAppId))
      .orderBy(desc(publishedAppVersions.versionNumber))
      .limit(1);
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const [created] = await db.insert(publishedAppVersions).values({
      publishedAppId,
      htmlContent,
      title,
      versionNumber: nextVersion,
      snapshotReason: reason,
    }).returning();
    return created;
  }

  async getAppVersions(publishedAppId: number): Promise<PublishedAppVersion[]> {
    return db.select().from(publishedAppVersions)
      .where(eq(publishedAppVersions.publishedAppId, publishedAppId))
      .orderBy(desc(publishedAppVersions.versionNumber));
  }

  async getAppVersion(id: number): Promise<PublishedAppVersion | undefined> {
    const [version] = await db.select().from(publishedAppVersions).where(eq(publishedAppVersions.id, id));
    return version;
  }

  async restoreAppVersion(publishedAppId: number, versionId: number): Promise<PublishedApp> {
    const version = await this.getAppVersion(versionId);
    if (!version || version.publishedAppId !== publishedAppId) {
      throw new Error("Version not found or does not belong to this app");
    }
    const current = await db.select().from(publishedApps).where(eq(publishedApps.id, publishedAppId)).limit(1);
    if (current[0]) {
      await this.createAppVersion(publishedAppId, current[0].htmlContent, current[0].title, "pre-restore");
    }
    const [updated] = await db.update(publishedApps)
      .set({ htmlContent: version.htmlContent, title: version.title, updatedAt: new Date() })
      .where(eq(publishedApps.id, publishedAppId))
      .returning();
    return updated;
  }

  async deleteOldVersions(publishedAppId: number, keepCount: number): Promise<void> {
    const versions = await db.select({ id: publishedAppVersions.id })
      .from(publishedAppVersions)
      .where(eq(publishedAppVersions.publishedAppId, publishedAppId))
      .orderBy(desc(publishedAppVersions.versionNumber));
    const toDelete = versions.slice(keepCount);
    for (const v of toDelete) {
      await db.delete(publishedAppVersions).where(eq(publishedAppVersions.id, v.id));
    }
  }

  // ============ BLOG ============
  async getBlogPostsByUser(userId: string): Promise<BlogPost[]> {
    return db.select().from(blogPosts).where(eq(blogPosts.userId, userId)).orderBy(desc(blogPosts.createdAt));
  }

  async getBlogPost(id: number): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return post;
  }

  async createBlogPost(post: InsertBlogPost): Promise<BlogPost> {
    const [created] = await db.insert(blogPosts).values(post).returning();
    return created;
  }

  async updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<BlogPost> {
    const [updated] = await db.update(blogPosts).set({ ...data, updatedAt: new Date() }).where(eq(blogPosts.id, id)).returning();
    return updated;
  }

  async deleteBlogPost(id: number): Promise<void> {
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
  }

  // ============ EMAIL SUBSCRIBERS ============
  async getEmailSubscribersByUser(userId: string): Promise<EmailSubscriber[]> {
    return db.select().from(emailSubscribers).where(eq(emailSubscribers.userId, userId)).orderBy(desc(emailSubscribers.subscribedAt));
  }

  async addEmailSubscriber(sub: InsertEmailSubscriber): Promise<EmailSubscriber> {
    const [created] = await db.insert(emailSubscribers).values(sub).returning();
    return created;
  }

  async updateEmailSubscriberStatus(id: number, status: string): Promise<void> {
    await db.update(emailSubscribers).set({ status }).where(eq(emailSubscribers.id, id));
  }

  async deleteEmailSubscriber(id: number): Promise<void> {
    await db.delete(emailSubscribers).where(eq(emailSubscribers.id, id));
  }

  // ============ EMAIL CAMPAIGNS ============
  async getEmailCampaignsByUser(userId: string): Promise<EmailCampaign[]> {
    return db.select().from(emailCampaigns).where(eq(emailCampaigns.userId, userId)).orderBy(desc(emailCampaigns.createdAt));
  }

  async getEmailCampaign(id: number): Promise<EmailCampaign | undefined> {
    const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id));
    return campaign;
  }

  async createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign> {
    const [created] = await db.insert(emailCampaigns).values(campaign).returning();
    return created;
  }

  async updateEmailCampaign(id: number, data: Partial<InsertEmailCampaign>): Promise<EmailCampaign> {
    const [updated] = await db.update(emailCampaigns).set(data).where(eq(emailCampaigns.id, id)).returning();
    return updated;
  }

  async deleteEmailCampaign(id: number): Promise<void> {
    await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
  }
}

export const storage = new DatabaseStorage();
