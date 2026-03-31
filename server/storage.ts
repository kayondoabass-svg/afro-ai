import { FOUNDER_EMAILS } from "./replit_integrations/auth/storage";
import { db } from "./db";
import { projects, publishedApps, publishedAppVersions, referrals, payments, usageLogs, forms, formSubmissions, blogPosts, emailSubscribers, emailCampaigns, appViews, marketplaceListings, projectCollaborators, domainOrders, affiliateApplications, apiIntegrations, webhooks, appSeo, chatbotWidgets, widgetConversations, chatbotSubscriptions, ussdSubscriptions, ussdApps, userFiles, zipExports, appSecrets, activityLogs, type Project, type InsertProject, type PublishedApp, type InsertPublishedApp, type PublishedAppVersion, type Referral, type InsertReferral, type Payment, type InsertPayment, type UsageLog, type InsertUsageLog, type Form, type InsertForm, type FormSubmission, type InsertFormSubmission, type BlogPost, type InsertBlogPost, type EmailSubscriber, type InsertEmailSubscriber, type EmailCampaign, type InsertEmailCampaign, type AppView, type MarketplaceListing, type InsertMarketplaceListing, type ProjectCollaborator, type InsertProjectCollaborator, type DomainOrder, type InsertDomainOrder, type AffiliateApplication, type InsertAffiliateApplication, type ApiIntegration, type InsertApiIntegration, type Webhook, type InsertWebhook, type AppSeo, type InsertAppSeo, type ChatbotWidget, type InsertChatbotWidget, type WidgetConversation, type ChatbotSubscription, type InsertChatbotSubscription, type UssdSubscription, type InsertUssdSubscription, type UssdApp, type InsertUssdApp, type UserFile, type InsertUserFile, type ZipExport, type InsertZipExport, type AppSecret, type InsertAppSecret, type ActivityLog, type InsertActivityLog } from "@shared/schema";
import { users } from "@shared/models/auth";
import { conversations, messages, appVersions, type AppVersion, type InsertAppVersion } from "@shared/models/chat";
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
  getPublishedAppById(id: number): Promise<PublishedApp | undefined>;
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
  getPlatformStats(): Promise<any>;
  adminSetUserPlan(userId: string, plan: string): Promise<void>;
  adminAddPaygCredits(userId: string, cents: number): Promise<void>;
  getUserReferralCode(userId: string): Promise<string>;
  getUserByReferralCode(code: string): Promise<any | undefined>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  getReferralsByReferrer(referrerId: string): Promise<Referral[]>;
  updateReferralStatus(referredId: string, status: string, commissionAmount: number, paidPlan: string): Promise<void>;
  addReferralCredit(userId: string, amount: number): Promise<void>;
  getUserReferralStats(userId: string): Promise<{ totalReferrals: number; paidReferrals: number; totalEarnings: number; credit: number }>;
  updateUserPlan(userId: string, plan: string): Promise<void>;
  createAffiliateApplication(data: InsertAffiliateApplication): Promise<AffiliateApplication>;
  getAffiliateApplicationByEmail(email: string): Promise<AffiliateApplication | undefined>;
  getAllAffiliateApplications(): Promise<AffiliateApplication[]>;
  updateAffiliateStatus(id: number, status: string): Promise<void>;
  // API Integrations
  getApiIntegrations(userId: string): Promise<ApiIntegration[]>;
  getApiIntegration(id: number): Promise<ApiIntegration | undefined>;
  createApiIntegration(data: InsertApiIntegration): Promise<ApiIntegration>;
  updateApiIntegration(id: number, data: Partial<InsertApiIntegration & { lastTestedAt?: Date; lastTestStatus?: number }>): Promise<ApiIntegration>;
  deleteApiIntegration(id: number): Promise<void>;
  // Webhooks
  getWebhooks(userId: string): Promise<Webhook[]>;
  getWebhook(id: number): Promise<Webhook | undefined>;
  createWebhook(data: InsertWebhook): Promise<Webhook>;
  updateWebhook(id: number, data: Partial<InsertWebhook & { lastTriggeredAt?: Date; lastStatus?: number }>): Promise<Webhook>;
  deleteWebhook(id: number): Promise<void>;
  getWebhooksByEvent(userId: string, event: string, publishedAppId?: number): Promise<Webhook[]>;
  // App SEO
  getAppSeo(publishedAppId: number): Promise<AppSeo | undefined>;
  upsertAppSeo(data: InsertAppSeo): Promise<AppSeo>;
  // Chatbot Widgets
  getChatbotWidgetsByUser(userId: string): Promise<ChatbotWidget[]>;
  getChatbotWidgetById(id: number): Promise<ChatbotWidget | undefined>;
  getChatbotWidgetByApiKey(apiKey: string): Promise<ChatbotWidget | undefined>;
  createChatbotWidget(data: InsertChatbotWidget & { apiKey: string }): Promise<ChatbotWidget>;
  updateChatbotWidget(id: number, data: Partial<InsertChatbotWidget>): Promise<ChatbotWidget>;
  deleteChatbotWidget(id: number): Promise<void>;
  incrementWidgetConversationCount(widgetId: number): Promise<void>;
  getWidgetConversation(widgetId: number, sessionId: string): Promise<WidgetConversation | undefined>;
  upsertWidgetConversation(widgetId: number, sessionId: string, messages: any[]): Promise<WidgetConversation>;
  getWidgetConversations(widgetId: number): Promise<WidgetConversation[]>;
  // Chatbot Subscriptions
  getChatbotSubscription(userId: string): Promise<ChatbotSubscription | undefined>;
  createChatbotSubscription(data: InsertChatbotSubscription): Promise<ChatbotSubscription>;
  updateChatbotSubscription(userId: string, data: Partial<InsertChatbotSubscription>): Promise<ChatbotSubscription>;
  incrementChatbotRepliesUsed(userId: string): Promise<void>;
  getUser(userId: string): Promise<any | undefined>;
  updateUserExperience(userId: string, level: string): Promise<void>;
  // User files
  getUserFiles(userId: string): Promise<UserFile[]>;
  createUserFile(data: InsertUserFile): Promise<UserFile>;
  deleteUserFile(id: number): Promise<void>;
  // Zip exports
  getZipExports(userId: string): Promise<ZipExport[]>;
  createZipExport(data: InsertZipExport): Promise<ZipExport>;
  // App Secrets
  getAppSecrets(userId: string, appId?: number | null): Promise<AppSecret[]>;
  createAppSecret(data: InsertAppSecret): Promise<AppSecret>;
  updateAppSecret(id: number, value: string): Promise<AppSecret>;
  deleteAppSecret(id: number): Promise<void>;
  // Activity Logs
  getActivityLogs(userId: string, limit?: number): Promise<ActivityLog[]>;
  createActivityLog(data: InsertActivityLog): Promise<ActivityLog>;
  deleteActivityLog(id: number): Promise<void>;
  // App version history
  saveAppVersion(data: InsertAppVersion): Promise<AppVersion>;
  getAppVersions(conversationId: number): Promise<AppVersion[]>;
  getAppVersion(id: number): Promise<AppVersion | undefined>;
  // PAYG credit management
  addPaygBalance(userId: string, cents: number): Promise<void>;
  deductPaygBalance(userId: string, cents: number): Promise<void>;
  setPaygLimit(userId: string, limitCents: number): Promise<void>;
  getPaygStatus(userId: string): Promise<{ balance: number; limit: number; spent: number }>;
  // Free trial
  setFreeTrialStarted(userId: string): Promise<void>;
  suspendExpiredFreeApps(): Promise<number>;
  // Free plan app count
  countActiveAppsForUser(userId: string): Promise<number>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePaymentByMerchantRef(merchantRef: string, data: Partial<InsertPayment>): Promise<Payment | undefined>;
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  getAllPayments(limit?: number): Promise<Payment[]>;
  getPaymentById(id: number): Promise<Payment | undefined>;
  getPaymentByMerchantRef(merchantRef: string): Promise<Payment | undefined>;
  deletePayment(id: number): Promise<void>;
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
  // Analytics
  recordAppView(publishedAppId: number): Promise<void>;
  getAppViewsByUser(userId: string): Promise<{ app: PublishedApp; views: AppView[] }[]>;
  getAppViewStats(publishedAppId: number): Promise<{ date: string; views: number }[]>;
  // Marketplace
  getMarketplaceListings(category?: string, search?: string): Promise<MarketplaceListing[]>;
  getMarketplaceListingsByUser(userId: string): Promise<MarketplaceListing[]>;
  getMarketplaceListing(id: number): Promise<MarketplaceListing | undefined>;
  createMarketplaceListing(listing: InsertMarketplaceListing): Promise<MarketplaceListing>;
  updateMarketplaceListing(id: number, data: Partial<InsertMarketplaceListing>): Promise<MarketplaceListing>;
  deleteMarketplaceListing(id: number): Promise<void>;
  incrementListingDownloads(id: number): Promise<void>;
  // Collaboration
  getCollaboratorsByProject(projectId: number): Promise<ProjectCollaborator[]>;
  getSharedProjectsByEmail(email: string): Promise<{ project: Project; collaborator: ProjectCollaborator }[]>;
  addCollaborator(data: InsertProjectCollaborator): Promise<ProjectCollaborator>;
  updateCollaboratorStatus(id: number, status: string, userId?: string): Promise<void>;
  removeCollaborator(id: number): Promise<void>;
  // Domain Orders
  getDomainOrdersByUser(userId: string): Promise<DomainOrder[]>;
  getDomainOrder(id: number): Promise<DomainOrder | undefined>;
  createDomainOrder(order: InsertDomainOrder): Promise<DomainOrder>;
  updateDomainOrder(id: number, data: Partial<InsertDomainOrder>): Promise<DomainOrder>;
  // USSD Subscriptions
  getUssdSubscription(userId: string): Promise<UssdSubscription | undefined>;
  createUssdSubscription(data: InsertUssdSubscription): Promise<UssdSubscription>;
  updateUssdSubscription(userId: string, data: Partial<InsertUssdSubscription>): Promise<UssdSubscription | undefined>;
  // USSD Apps
  getUssdAppsByUser(userId: string): Promise<UssdApp[]>;
  getUssdAppByKey(apiKey: string): Promise<UssdApp | undefined>;
  getUssdApp(id: number): Promise<UssdApp | undefined>;
  createUssdApp(data: InsertUssdApp): Promise<UssdApp>;
  updateUssdApp(id: number, data: Partial<InsertUssdApp & { sessionsUsed?: number }>): Promise<UssdApp>;
  deleteUssdApp(id: number): Promise<void>;
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

  async getPublishedAppById(id: number): Promise<PublishedApp | undefined> {
    const [row] = await db.select().from(publishedApps).where(eq(publishedApps.id, id));
    return row;
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
    const [suspendedCount] = await db.select({ value: count() }).from(publishedApps).where(eq(publishedApps.appStatus, "suspended"));
    const [domainOrderCount] = await db.select({ value: count() }).from(domainOrders);

    // New feature stats
    const [ussdTotalCount] = await db.select({ value: count() }).from(ussdSubscriptions);
    const [ussdActiveCount] = await db.select({ value: count() }).from(ussdSubscriptions).where(eq(ussdSubscriptions.status, "active"));
    const allUssdSubs = await db.select({ plan: ussdSubscriptions.plan }).from(ussdSubscriptions).where(eq(ussdSubscriptions.status, "active"));
    const ussdPlanBreakdown = { starter: 0, growth: 0, enterprise: 0 };
    for (const s of allUssdSubs) {
      const p = s.plan?.toLowerCase() || "";
      if (p === "starter") ussdPlanBreakdown.starter++;
      else if (p === "growth") ussdPlanBreakdown.growth++;
      else if (p === "enterprise") ussdPlanBreakdown.enterprise++;
    }

    const [chatbotCount] = await db.select({ value: count() }).from(chatbotWidgets);
    const [activeChatbotCount] = await db.select({ value: count() }).from(chatbotWidgets).where(eq(chatbotWidgets.isActive, true));
    const [chatbotConvoCount] = await db.select({ value: count() }).from(widgetConversations);

    const [marketplaceCount] = await db.select({ value: count() }).from(marketplaceListings);
    const [marketplaceDownloads] = await db.select({ value: sql<number>`coalesce(sum(downloads), 0)` }).from(marketplaceListings);

    const [blogTotalCount] = await db.select({ value: count() }).from(blogPosts);
    const [blogPublishedCount] = await db.select({ value: count() }).from(blogPosts).where(eq(blogPosts.status, "published"));

    const [emailSubCount] = await db.select({ value: count() }).from(emailSubscribers);
    const [emailSubActiveCount] = await db.select({ value: count() }).from(emailSubscribers).where(eq(emailSubscribers.isActive, true));
    const [emailCampaignCount] = await db.select({ value: count() }).from(emailCampaigns);

    const [fileCount] = await db.select({ value: count() }).from(userFiles);
    const [zipExportCount] = await db.select({ value: count() }).from(zipExports);

    const [webhookCount] = await db.select({ value: count() }).from(webhooks);
    const [activeWebhookCount] = await db.select({ value: count() }).from(webhooks).where(eq(webhooks.isActive, true));

    const [formCount] = await db.select({ value: count() }).from(forms);
    const [formSubCount] = await db.select({ value: count() }).from(formSubmissions);

    // Plan breakdown
    const allUsers = await db.select({ plan: users.plan, paygBalance: users.paygBalance, paygSpent: users.paygSpent }).from(users);
    const planBreakdown = { starter: 0, pro: 0, business: 0, payg: 0, other: 0 };
    let totalPaygBalanceCents = 0, totalPaygSpentCents = 0;
    for (const u of allUsers) {
      const p = (u.plan || "starter").toLowerCase();
      if (p === "pro") planBreakdown.pro++;
      else if (p === "business") planBreakdown.business++;
      else if (p === "payg") planBreakdown.payg++;
      else if (p === "starter") planBreakdown.starter++;
      else planBreakdown.other++;
      totalPaygBalanceCents += u.paygBalance ?? 0;
      totalPaygSpentCents += u.paygSpent ?? 0;
    }

    // Estimated MRR (monthly recurring revenue in USD)
    const ussdMRR = ussdPlanBreakdown.starter * 29 + ussdPlanBreakdown.growth * 79 + ussdPlanBreakdown.enterprise * 199;
    const estimatedMRR = (planBreakdown.pro * 1500 + planBreakdown.business * 2990) / 100 + ussdMRR;

    const recentUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(15);
    const recentProjects = await db.select().from(projects).orderBy(desc(projects.createdAt)).limit(10);
    const recentPublishedApps = await db.select().from(publishedApps).orderBy(desc(publishedApps.createdAt)).limit(15);
    const recentDomainOrders = await db.select().from(domainOrders).orderBy(desc(domainOrders.createdAt)).limit(10);
    const recentUssdSubs = await db.select().from(ussdSubscriptions).orderBy(desc(ussdSubscriptions.createdAt)).limit(10);
    const recentChatbots = await db.select().from(chatbotWidgets).orderBy(desc(chatbotWidgets.createdAt)).limit(10);

    return {
      totalUsers: userCount.value,
      totalProjects: projectCount.value,
      totalPublishedApps: publishedCount.value,
      totalConversations: convoCount.value,
      totalMessages: msgCount.value,
      suspendedApps: suspendedCount.value,
      totalDomainOrders: domainOrderCount.value,
      planBreakdown,
      estimatedMRR,
      totalPaygBalanceCents,
      totalPaygSpentCents,
      // USSD
      totalUssdSubscriptions: ussdTotalCount.value,
      activeUssdSubscriptions: ussdActiveCount.value,
      ussdPlanBreakdown,
      // Chatbot API
      totalChatbots: chatbotCount.value,
      activeChatbots: activeChatbotCount.value,
      totalChatbotConversations: chatbotConvoCount.value,
      // Marketplace
      totalMarketplaceListings: marketplaceCount.value,
      totalMarketplaceDownloads: Number(marketplaceDownloads.value) || 0,
      // Blog
      totalBlogPosts: blogTotalCount.value,
      publishedBlogPosts: blogPublishedCount.value,
      // Email
      totalEmailSubscribers: emailSubCount.value,
      activeEmailSubscribers: emailSubActiveCount.value,
      totalEmailCampaigns: emailCampaignCount.value,
      // Files
      totalUserFiles: fileCount.value,
      totalZipExports: zipExportCount.value,
      // Webhooks
      totalWebhooks: webhookCount.value,
      activeWebhooks: activeWebhookCount.value,
      // Forms
      totalForms: formCount.value,
      totalFormSubmissions: formSubCount.value,
      // Recent lists
      recentUsers,
      recentProjects,
      recentPublishedApps,
      recentDomainOrders,
      recentUssdSubs,
      recentChatbots,
    };
  }

  async adminSetUserPlan(userId: string, plan: string): Promise<void> {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (u?.email && FOUNDER_EMAILS.includes(u.email)) return; // Founder plan is immutable
    await db.update(users).set({ plan }).where(eq(users.id, userId));
  }

  async adminAddPaygCredits(userId: string, cents: number): Promise<void> {
    await db.update(users).set({ paygBalance: sql`payg_balance + ${cents}` }).where(eq(users.id, userId));
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
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (u?.email && FOUNDER_EMAILS.includes(u.email)) return; // Founder plan is immutable
    await db.update(users).set({ plan, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateUserExperience(userId: string, level: string): Promise<void> {
    await db.update(users).set({ experienceLevel: level, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async saveAppVersion(data: InsertAppVersion): Promise<AppVersion> {
    const [version] = await db.insert(appVersions).values(data).returning();
    return version;
  }

  async getAppVersions(conversationId: number): Promise<AppVersion[]> {
    return db.select().from(appVersions)
      .where(eq(appVersions.conversationId, conversationId))
      .orderBy(desc(appVersions.createdAt));
  }

  async getAppVersion(id: number): Promise<AppVersion | undefined> {
    const [version] = await db.select().from(appVersions).where(eq(appVersions.id, id));
    return version;
  }

  async createAffiliateApplication(data: InsertAffiliateApplication): Promise<AffiliateApplication> {
    const [created] = await db.insert(affiliateApplications).values(data).returning();
    return created;
  }

  async getAffiliateApplicationByEmail(email: string): Promise<AffiliateApplication | undefined> {
    const [app] = await db.select().from(affiliateApplications).where(eq(affiliateApplications.email, email));
    return app;
  }

  async getAllAffiliateApplications(): Promise<AffiliateApplication[]> {
    return db.select().from(affiliateApplications).orderBy(desc(affiliateApplications.createdAt));
  }

  async updateAffiliateStatus(id: number, status: string): Promise<void> {
    await db.update(affiliateApplications).set({ status }).where(eq(affiliateApplications.id, id));
  }

  async getUser(userId: string): Promise<any | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async addPaygBalance(userId: string, cents: number): Promise<void> {
    await db.update(users).set({
      paygBalance: sql`payg_balance + ${cents}`,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }

  async deductPaygBalance(userId: string, cents: number): Promise<void> {
    await db.update(users).set({
      paygBalance: sql`GREATEST(payg_balance - ${cents}, 0)`,
      paygSpent: sql`payg_spent + ${cents}`,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }

  async setPaygLimit(userId: string, limitCents: number): Promise<void> {
    await db.update(users).set({ paygLimit: limitCents, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async getPaygStatus(userId: string): Promise<{ balance: number; limit: number; spent: number }> {
    const [user] = await db.select({ balance: users.paygBalance, limit: users.paygLimit, spent: users.paygSpent }).from(users).where(eq(users.id, userId));
    return user || { balance: 0, limit: 1000, spent: 0 };
  }

  async setFreeTrialStarted(userId: string): Promise<void> {
    const [user] = await db.select({ freeTrialStarted: users.freeTrialStarted }).from(users).where(eq(users.id, userId));
    if (!user?.freeTrialStarted) {
      await db.update(users).set({ freeTrialStarted: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    }
  }

  async suspendExpiredFreeApps(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const starterUsers = await db.select({ id: users.id }).from(users).where(eq(users.plan, "starter"));
    let suspended = 0;
    for (const u of starterUsers) {
      const expiredApps = await db.select({ id: publishedApps.id }).from(publishedApps).where(
        and(
          eq(publishedApps.userId, u.id),
          eq(publishedApps.appStatus, "active"),
          sql`${publishedApps.createdAt} < ${thirtyDaysAgo}`,
        )
      );
      for (const app of expiredApps) {
        await db.update(publishedApps).set({
          appStatus: "suspended",
          suspendedAt: new Date(),
          suspendReason: "Free plan 30-day limit reached. Upgrade to keep your app live.",
          updatedAt: new Date(),
        }).where(eq(publishedApps.id, app.id));
        suspended++;
      }
    }
    return suspended;
  }

  async countActiveAppsForUser(userId: string): Promise<number> {
    const [row] = await db.select({ count: count() }).from(publishedApps).where(
      and(eq(publishedApps.userId, userId), eq(publishedApps.appStatus, "active"))
    );
    return row?.count || 0;
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

  async getAllPayments(limit = 200): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(limit);
  }

  async getPaymentById(id: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async getPaymentByMerchantRef(merchantRef: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.merchantReference, merchantRef));
    return payment;
  }

  async deletePayment(id: number): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
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

  // ============ ANALYTICS ============
  async recordAppView(publishedAppId: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    await db.execute(sql`
      INSERT INTO app_views (published_app_id, view_date, views)
      VALUES (${publishedAppId}, ${today}, 1)
      ON CONFLICT (published_app_id, view_date)
      DO UPDATE SET views = app_views.views + 1
    `);
  }

  async getAppViewsByUser(userId: string): Promise<{ app: PublishedApp; views: AppView[] }[]> {
    const userApps = await db.select().from(publishedApps).where(eq(publishedApps.userId, userId));
    const result = [];
    for (const app of userApps) {
      const views = await db.select().from(appViews)
        .where(eq(appViews.publishedAppId, app.id))
        .orderBy(desc(appViews.viewDate))
        .limit(30);
      result.push({ app, views });
    }
    return result;
  }

  async getAppViewStats(publishedAppId: number): Promise<{ date: string; views: number }[]> {
    const rows = await db.select().from(appViews)
      .where(eq(appViews.publishedAppId, publishedAppId))
      .orderBy(appViews.viewDate)
      .limit(30);
    return rows.map(r => ({ date: r.viewDate, views: r.views }));
  }

  // ============ MARKETPLACE ============
  async getMarketplaceListings(category?: string, search?: string): Promise<MarketplaceListing[]> {
    let query = db.select().from(marketplaceListings).where(eq(marketplaceListings.status, "active"));
    const rows = await query.orderBy(desc(marketplaceListings.downloads));
    return rows.filter(r =>
      (!category || category === "all" || r.category === category) &&
      (!search || r.title.toLowerCase().includes(search.toLowerCase()) || (r.description || "").toLowerCase().includes(search.toLowerCase()))
    );
  }

  async getMarketplaceListingsByUser(userId: string): Promise<MarketplaceListing[]> {
    return db.select().from(marketplaceListings).where(eq(marketplaceListings.userId, userId)).orderBy(desc(marketplaceListings.createdAt));
  }

  async getMarketplaceListing(id: number): Promise<MarketplaceListing | undefined> {
    const [row] = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, id));
    return row;
  }

  async createMarketplaceListing(listing: InsertMarketplaceListing): Promise<MarketplaceListing> {
    const [created] = await db.insert(marketplaceListings).values(listing).returning();
    return created;
  }

  async updateMarketplaceListing(id: number, data: Partial<InsertMarketplaceListing>): Promise<MarketplaceListing> {
    const [updated] = await db.update(marketplaceListings).set(data).where(eq(marketplaceListings.id, id)).returning();
    return updated;
  }

  async deleteMarketplaceListing(id: number): Promise<void> {
    await db.delete(marketplaceListings).where(eq(marketplaceListings.id, id));
  }

  async incrementListingDownloads(id: number): Promise<void> {
    await db.execute(sql`UPDATE marketplace_listings SET downloads = downloads + 1 WHERE id = ${id}`);
  }

  // ============ COLLABORATION ============
  async getCollaboratorsByProject(projectId: number): Promise<ProjectCollaborator[]> {
    return db.select().from(projectCollaborators).where(eq(projectCollaborators.projectId, projectId)).orderBy(desc(projectCollaborators.invitedAt));
  }

  async getSharedProjectsByEmail(email: string): Promise<{ project: Project; collaborator: ProjectCollaborator }[]> {
    const collabs = await db.select().from(projectCollaborators).where(eq(projectCollaborators.inviteEmail, email));
    const result = [];
    for (const collab of collabs) {
      const [project] = await db.select().from(projects).where(eq(projects.id, collab.projectId));
      if (project) result.push({ project, collaborator: collab });
    }
    return result;
  }

  async addCollaborator(data: InsertProjectCollaborator): Promise<ProjectCollaborator> {
    const [created] = await db.insert(projectCollaborators).values(data).returning();
    return created;
  }

  async updateCollaboratorStatus(id: number, status: string, userId?: string): Promise<void> {
    await db.update(projectCollaborators).set({ status, ...(userId ? { userId } : {}) }).where(eq(projectCollaborators.id, id));
  }

  async removeCollaborator(id: number): Promise<void> {
    await db.delete(projectCollaborators).where(eq(projectCollaborators.id, id));
  }

  // ============ DOMAIN ORDERS ============
  async getDomainOrdersByUser(userId: string): Promise<DomainOrder[]> {
    return db.select().from(domainOrders).where(eq(domainOrders.userId, userId)).orderBy(desc(domainOrders.createdAt));
  }

  async getDomainOrder(id: number): Promise<DomainOrder | undefined> {
    const [row] = await db.select().from(domainOrders).where(eq(domainOrders.id, id));
    return row;
  }

  async createDomainOrder(order: InsertDomainOrder): Promise<DomainOrder> {
    const [created] = await db.insert(domainOrders).values(order).returning();
    return created;
  }

  async updateDomainOrder(id: number, data: Partial<InsertDomainOrder>): Promise<DomainOrder> {
    const [updated] = await db.update(domainOrders).set(data).where(eq(domainOrders.id, id)).returning();
    return updated;
  }

  // ============ API INTEGRATIONS ============
  async getApiIntegrations(userId: string): Promise<ApiIntegration[]> {
    return db.select().from(apiIntegrations).where(eq(apiIntegrations.userId, userId)).orderBy(desc(apiIntegrations.createdAt));
  }
  async getApiIntegration(id: number): Promise<ApiIntegration | undefined> {
    const [row] = await db.select().from(apiIntegrations).where(eq(apiIntegrations.id, id));
    return row;
  }
  async createApiIntegration(data: InsertApiIntegration): Promise<ApiIntegration> {
    const [created] = await db.insert(apiIntegrations).values(data).returning();
    return created;
  }
  async updateApiIntegration(id: number, data: Partial<InsertApiIntegration & { lastTestedAt?: Date; lastTestStatus?: number }>): Promise<ApiIntegration> {
    const [updated] = await db.update(apiIntegrations).set(data as any).where(eq(apiIntegrations.id, id)).returning();
    return updated;
  }
  async deleteApiIntegration(id: number): Promise<void> {
    await db.delete(apiIntegrations).where(eq(apiIntegrations.id, id));
  }

  // ============ WEBHOOKS ============
  async getWebhooks(userId: string): Promise<Webhook[]> {
    return db.select().from(webhooks).where(eq(webhooks.userId, userId)).orderBy(desc(webhooks.createdAt));
  }
  async getWebhook(id: number): Promise<Webhook | undefined> {
    const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id));
    return row;
  }
  async createWebhook(data: InsertWebhook): Promise<Webhook> {
    const [created] = await db.insert(webhooks).values(data).returning();
    return created;
  }
  async updateWebhook(id: number, data: Partial<InsertWebhook & { lastTriggeredAt?: Date; lastStatus?: number }>): Promise<Webhook> {
    const [updated] = await db.update(webhooks).set(data as any).where(eq(webhooks.id, id)).returning();
    return updated;
  }
  async deleteWebhook(id: number): Promise<void> {
    await db.delete(webhooks).where(eq(webhooks.id, id));
  }
  async getWebhooksByEvent(userId: string, event: string, publishedAppId?: number): Promise<Webhook[]> {
    const rows = await db.select().from(webhooks)
      .where(and(eq(webhooks.userId, userId), eq(webhooks.isActive, true)));
    return rows.filter(w => w.events.includes(event) && (publishedAppId == null || w.publishedAppId == null || w.publishedAppId === publishedAppId));
  }

  // ============ APP SEO ============
  async getAppSeo(publishedAppId: number): Promise<AppSeo | undefined> {
    const [row] = await db.select().from(appSeo).where(eq(appSeo.publishedAppId, publishedAppId));
    return row;
  }
  async upsertAppSeo(data: InsertAppSeo): Promise<AppSeo> {
    const existing = await this.getAppSeo(data.publishedAppId);
    if (existing) {
      const [updated] = await db.update(appSeo).set({ ...data, updatedAt: new Date() }).where(eq(appSeo.publishedAppId, data.publishedAppId)).returning();
      return updated;
    }
    const [created] = await db.insert(appSeo).values(data).returning();
    return created;
  }

  // ============ CHATBOT WIDGETS ============
  async getChatbotWidgetsByUser(userId: string): Promise<ChatbotWidget[]> {
    return db.select().from(chatbotWidgets).where(eq(chatbotWidgets.userId, userId)).orderBy(desc(chatbotWidgets.createdAt));
  }
  async getChatbotWidgetById(id: number): Promise<ChatbotWidget | undefined> {
    const [row] = await db.select().from(chatbotWidgets).where(eq(chatbotWidgets.id, id));
    return row;
  }
  async getChatbotWidgetByApiKey(apiKey: string): Promise<ChatbotWidget | undefined> {
    const [row] = await db.select().from(chatbotWidgets).where(eq(chatbotWidgets.apiKey, apiKey));
    return row;
  }
  async createChatbotWidget(data: InsertChatbotWidget & { apiKey: string }): Promise<ChatbotWidget> {
    const [created] = await db.insert(chatbotWidgets).values(data).returning();
    return created;
  }
  async updateChatbotWidget(id: number, data: Partial<InsertChatbotWidget>): Promise<ChatbotWidget> {
    const [updated] = await db.update(chatbotWidgets).set(data as any).where(eq(chatbotWidgets.id, id)).returning();
    return updated;
  }
  async deleteChatbotWidget(id: number): Promise<void> {
    await db.delete(chatbotWidgets).where(eq(chatbotWidgets.id, id));
  }
  async incrementWidgetConversationCount(widgetId: number): Promise<void> {
    await db.update(chatbotWidgets).set({ conversationCount: sql`${chatbotWidgets.conversationCount} + 1` }).where(eq(chatbotWidgets.id, widgetId));
  }
  async getWidgetConversation(widgetId: number, sessionId: string): Promise<WidgetConversation | undefined> {
    const [row] = await db.select().from(widgetConversations).where(and(eq(widgetConversations.widgetId, widgetId), eq(widgetConversations.sessionId, sessionId)));
    return row;
  }
  async upsertWidgetConversation(widgetId: number, sessionId: string, msgs: any[]): Promise<WidgetConversation> {
    const existing = await this.getWidgetConversation(widgetId, sessionId);
    const messagesJson = JSON.stringify(msgs);
    if (existing) {
      const [updated] = await db.update(widgetConversations).set({ messages: messagesJson, updatedAt: new Date() }).where(eq(widgetConversations.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(widgetConversations).values({ widgetId, sessionId, messages: messagesJson }).returning();
    await this.incrementWidgetConversationCount(widgetId);
    return created;
  }
  async getWidgetConversations(widgetId: number): Promise<WidgetConversation[]> {
    return db.select().from(widgetConversations).where(eq(widgetConversations.widgetId, widgetId)).orderBy(desc(widgetConversations.createdAt));
  }

  async getChatbotSubscription(userId: string): Promise<ChatbotSubscription | undefined> {
    const [sub] = await db.select().from(chatbotSubscriptions)
      .where(and(eq(chatbotSubscriptions.userId, userId), eq(chatbotSubscriptions.status, "active")))
      .orderBy(desc(chatbotSubscriptions.createdAt)).limit(1);
    return sub;
  }

  async createChatbotSubscription(data: InsertChatbotSubscription): Promise<ChatbotSubscription> {
    const [sub] = await db.insert(chatbotSubscriptions).values(data).returning();
    return sub;
  }

  async updateChatbotSubscription(userId: string, data: Partial<InsertChatbotSubscription>): Promise<ChatbotSubscription> {
    const [sub] = await db.update(chatbotSubscriptions).set(data)
      .where(and(eq(chatbotSubscriptions.userId, userId), eq(chatbotSubscriptions.status, "active")))
      .returning();
    return sub;
  }

  async incrementChatbotRepliesUsed(userId: string): Promise<void> {
    await db.update(chatbotSubscriptions)
      .set({ repliesUsed: sql`${chatbotSubscriptions.repliesUsed} + 1` })
      .where(and(eq(chatbotSubscriptions.userId, userId), eq(chatbotSubscriptions.status, "active")));
  }

  async getUserFiles(userId: string): Promise<UserFile[]> {
    return db.select().from(userFiles).where(eq(userFiles.userId, userId)).orderBy(desc(userFiles.createdAt));
  }

  async createUserFile(data: InsertUserFile): Promise<UserFile> {
    const [file] = await db.insert(userFiles).values(data).returning();
    return file;
  }

  async deleteUserFile(id: number): Promise<void> {
    await db.delete(userFiles).where(eq(userFiles.id, id));
  }

  async getZipExports(userId: string): Promise<ZipExport[]> {
    return db.select().from(zipExports).where(eq(zipExports.userId, userId)).orderBy(desc(zipExports.createdAt));
  }

  async createZipExport(data: InsertZipExport): Promise<ZipExport> {
    const [exp] = await db.insert(zipExports).values(data).returning();
    return exp;
  }

  async getUssdSubscription(userId: string): Promise<UssdSubscription | undefined> {
    const [sub] = await db.select().from(ussdSubscriptions).where(eq(ussdSubscriptions.userId, userId)).orderBy(desc(ussdSubscriptions.createdAt));
    return sub;
  }

  async createUssdSubscription(data: InsertUssdSubscription): Promise<UssdSubscription> {
    const [sub] = await db.insert(ussdSubscriptions).values(data).returning();
    return sub;
  }

  async updateUssdSubscription(userId: string, data: Partial<InsertUssdSubscription>): Promise<UssdSubscription | undefined> {
    const [sub] = await db.update(ussdSubscriptions).set(data).where(eq(ussdSubscriptions.userId, userId)).returning();
    return sub;
  }

  async getUssdAppsByUser(userId: string): Promise<UssdApp[]> {
    return db.select().from(ussdApps).where(eq(ussdApps.userId, userId)).orderBy(desc(ussdApps.createdAt));
  }
  async getUssdAppByKey(apiKey: string): Promise<UssdApp | undefined> {
    const [app] = await db.select().from(ussdApps).where(eq(ussdApps.apiKey, apiKey));
    return app;
  }
  async getUssdApp(id: number): Promise<UssdApp | undefined> {
    const [app] = await db.select().from(ussdApps).where(eq(ussdApps.id, id));
    return app;
  }
  async createUssdApp(data: InsertUssdApp): Promise<UssdApp> {
    const [app] = await db.insert(ussdApps).values(data).returning();
    return app;
  }
  async updateUssdApp(id: number, data: Partial<InsertUssdApp & { sessionsUsed?: number }>): Promise<UssdApp> {
    const [app] = await db.update(ussdApps).set(data as any).where(eq(ussdApps.id, id)).returning();
    return app;
  }
  async deleteUssdApp(id: number): Promise<void> {
    await db.delete(ussdApps).where(eq(ussdApps.id, id));
  }

  async getAppSecrets(userId: string, appId?: number | null): Promise<AppSecret[]> {
    if (appId !== undefined) {
      const condition = appId === null
        ? and(eq(appSecrets.userId, userId), sql`${appSecrets.appId} IS NULL`)
        : and(eq(appSecrets.userId, userId), eq(appSecrets.appId, appId));
      return db.select().from(appSecrets).where(condition).orderBy(desc(appSecrets.createdAt));
    }
    return db.select().from(appSecrets).where(eq(appSecrets.userId, userId)).orderBy(desc(appSecrets.createdAt));
  }

  async createAppSecret(data: InsertAppSecret): Promise<AppSecret> {
    const [secret] = await db.insert(appSecrets).values(data).returning();
    return secret;
  }

  async updateAppSecret(id: number, value: string): Promise<AppSecret> {
    const [secret] = await db.update(appSecrets).set({ value }).where(eq(appSecrets.id, id)).returning();
    return secret;
  }

  async deleteAppSecret(id: number): Promise<void> {
    await db.delete(appSecrets).where(eq(appSecrets.id, id));
  }

  async getActivityLogs(userId: string, limit = 100): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  async createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db.insert(activityLogs).values(data).returning();
    return log;
  }

  async deleteActivityLog(id: number): Promise<void> {
    await db.delete(activityLogs).where(eq(activityLogs.id, id));
  }
}

export const storage = new DatabaseStorage();
