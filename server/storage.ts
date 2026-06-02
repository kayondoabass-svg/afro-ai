import { FOUNDER_EMAILS } from "./replit_integrations/auth/storage";
import { db } from "./db";
import { projects, publishedApps, publishedAppVersions, appFeedback, referrals, payments, usageLogs, forms, formSubmissions, blogPosts, emailSubscribers, emailCampaigns, appViews, marketplaceListings, projectCollaborators, domainOrders, affiliateApplications, apiIntegrations, webhooks, appSeo, chatbotWidgets, widgetConversations, chatbotSubscriptions, chatbotQas, chatbotScannedPages, ussdSubscriptions, ussdApps, userFiles, zipExports, appSecrets, activityLogs, teamMembers, partnerApplications, partners, partnerCustomers, partnerCommissions, partnerLeads, partnerPayouts, partnerCertifications, type Project, type InsertProject, type PublishedApp, type InsertPublishedApp, type PublishedAppVersion, type AppFeedback, type InsertAppFeedback, type Referral, type InsertReferral, type Payment, type InsertPayment, type UsageLog, type InsertUsageLog, type Form, type InsertForm, type FormSubmission, type InsertFormSubmission, type BlogPost, type InsertBlogPost, type EmailSubscriber, type InsertEmailSubscriber, type EmailCampaign, type InsertEmailCampaign, type AppView, type MarketplaceListing, type InsertMarketplaceListing, type ProjectCollaborator, type InsertProjectCollaborator, type DomainOrder, type InsertDomainOrder, type AffiliateApplication, type InsertAffiliateApplication, type ApiIntegration, type InsertApiIntegration, type Webhook, type InsertWebhook, type AppSeo, type InsertAppSeo, type ChatbotWidget, type InsertChatbotWidget, type WidgetConversation, type ChatbotSubscription, type InsertChatbotSubscription, type ChatbotQa, type InsertChatbotQa, type ChatbotScannedPage, type UssdSubscription, type InsertUssdSubscription, type UssdApp, type InsertUssdApp, type UserFile, type InsertUserFile, type ZipExport, type InsertZipExport, type AppSecret, type InsertAppSecret, type ActivityLog, type InsertActivityLog, type TeamMember, type InsertTeamMember, knowledgeDocuments, knowledgeChunks, type KnowledgeDocument, type InsertKnowledgeDocument, type KnowledgeChunk, type InsertKnowledgeChunk } from "@shared/schema";
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
  // App Feedback (Share-for-Feedback collab)
  createAppFeedback(data: InsertAppFeedback): Promise<AppFeedback>;
  getAppFeedback(publishedAppId: number, opts?: { onlyOpen?: boolean }): Promise<AppFeedback[]>;
  getAppFeedbackCount(publishedAppId: number, onlyOpen?: boolean): Promise<number>;
  getAppFeedbackById(id: number): Promise<AppFeedback | undefined>;
  resolveAppFeedback(id: number, resolved: boolean): Promise<AppFeedback>;
  deleteAppFeedback(id: number): Promise<void>;
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
  // Auto-Scan Q&A knowledge
  getChatbotQasByWidget(widgetId: number, opts?: { includedOnly?: boolean }): Promise<ChatbotQa[]>;
  getChatbotQaById(id: number): Promise<ChatbotQa | undefined>;
  bulkInsertChatbotQas(rows: InsertChatbotQa[]): Promise<ChatbotQa[]>;
  updateChatbotQa(id: number, data: Partial<InsertChatbotQa>): Promise<ChatbotQa>;
  deleteChatbotQa(id: number): Promise<void>;
  bulkUpdateChatbotQas(widgetId: number, filter: { topic?: string; sensitive?: boolean }, data: Partial<InsertChatbotQa>): Promise<number>;
  bulkDeleteChatbotQas(widgetId: number, filter: { topic?: string; sensitive?: boolean }): Promise<number>;
  getChatbotScannedPages(widgetId: number): Promise<ChatbotScannedPage[]>;
  upsertChatbotScannedPage(widgetId: number, url: string, contentHash: string): Promise<void>;
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
  deleteActivityLog(id: number, userId: string): Promise<boolean>;
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
  getPublishedAppVersions(publishedAppId: number): Promise<PublishedAppVersion[]>;
  getPublishedAppVersion(id: number): Promise<PublishedAppVersion | undefined>;
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

  // ============ COUNTRY/RESELLER PARTNER PROGRAM ============
  createPartnerApplication(data: any): Promise<any>;
  getPartnerApplicationByEmail(email: string): Promise<any | undefined>;
  getAllPartnerApplications(): Promise<any[]>;
  getPartnerApplication(id: number): Promise<any | undefined>;
  updatePartnerApplication(id: number, data: any): Promise<any>;

  createPartner(data: any): Promise<any>;
  getPartnerById(id: number): Promise<any | undefined>;
  getPartnerBySlug(slug: string): Promise<any | undefined>;
  getPartnerByUserId(userId: string): Promise<any | undefined>;
  getPartnerByCountry(country: string): Promise<any | undefined>;
  getAllPartners(opts?: { onlyPublic?: boolean }): Promise<any[]>;
  updatePartner(id: number, data: any): Promise<any>;

  attributePartnerCustomer(partnerId: number, userId: string): Promise<any>;
  getPartnerCustomers(partnerId: number): Promise<any[]>;
  getPartnerCustomerByUserId(userId: string): Promise<any | undefined>;

  createPartnerCommission(data: any): Promise<any>;
  getPartnerCommissions(partnerId: number): Promise<any[]>;
  updatePartnerCommissionStatus(id: number, status: string, payoutId?: number): Promise<void>;

  createPartnerLead(data: any): Promise<any>;
  getPartnerLeads(partnerId: number): Promise<any[]>;
  updatePartnerLeadStatus(id: number, status: string, notes?: string): Promise<void>;

  createPartnerPayout(data: any): Promise<any>;
  getPartnerPayouts(partnerId: number): Promise<any[]>;
  updatePartnerPayoutStatus(id: number, status: string, reference?: string): Promise<void>;

  getAllPartnerStats(): Promise<any>;
  getAllPartnerCommissions(): Promise<any[]>;
  getAllPartnerLeads(): Promise<any[]>;
  getAllPartnerPayouts(): Promise<any[]>;

  // ============ Knowledge Base (semantic RAG) ============
  createKnowledgeDocument(doc: InsertKnowledgeDocument): Promise<KnowledgeDocument>;
  getKnowledgeDocumentsByUser(userId: string): Promise<KnowledgeDocument[]>;
  getKnowledgeDocument(id: number): Promise<KnowledgeDocument | undefined>;
  updateKnowledgeDocument(id: number, data: Partial<KnowledgeDocument>): Promise<KnowledgeDocument>;
  deleteKnowledgeDocument(id: number): Promise<void>;
  insertKnowledgeChunks(rows: InsertKnowledgeChunk[]): Promise<void>;
  getKnowledgeChunksForUser(userId: string): Promise<KnowledgeChunk[]>;
  deleteKnowledgeChunksByDocument(documentId: number): Promise<void>;
  setChatbotQaEmbedding(id: number, embedding: number[]): Promise<void>;
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
    try {
      const { deleteBlob, isR2Configured } = await import("./r2");
      if (isR2Configured()) {
        const [appRow] = await db.select({ key: publishedApps.htmlR2Key }).from(publishedApps).where(eq(publishedApps.id, id));
        const versionKeys = await db.select({ key: publishedAppVersions.htmlR2Key }).from(publishedAppVersions).where(eq(publishedAppVersions.publishedAppId, id));
        const allKeys = [appRow?.key, ...versionKeys.map(v => v.key)].filter((k): k is string => !!k);
        await Promise.all(allKeys.map(k => deleteBlob(k).catch(e => console.warn(`[r2] delete failed ${k}:`, e?.message))));
      }
    } catch (e: any) {
      console.warn("[deletePublishedApp] R2 cleanup skipped:", e?.message);
    }
    await db.delete(publishedApps).where(eq(publishedApps.id, id));
  }

  async createAppFeedback(data: InsertAppFeedback): Promise<AppFeedback> {
    const [row] = await db.insert(appFeedback).values(data).returning();
    return row;
  }
  async getAppFeedback(publishedAppId: number, opts?: { onlyOpen?: boolean }): Promise<AppFeedback[]> {
    const where = opts?.onlyOpen
      ? and(eq(appFeedback.publishedAppId, publishedAppId), eq(appFeedback.resolved, false))
      : eq(appFeedback.publishedAppId, publishedAppId);
    return await db.select().from(appFeedback).where(where).orderBy(desc(appFeedback.createdAt));
  }
  async getAppFeedbackCount(publishedAppId: number, onlyOpen?: boolean): Promise<number> {
    const where = onlyOpen
      ? and(eq(appFeedback.publishedAppId, publishedAppId), eq(appFeedback.resolved, false))
      : eq(appFeedback.publishedAppId, publishedAppId);
    const [row] = await db.select({ c: count() }).from(appFeedback).where(where);
    return Number(row?.c || 0);
  }
  async getAppFeedbackById(id: number): Promise<AppFeedback | undefined> {
    const [row] = await db.select().from(appFeedback).where(eq(appFeedback.id, id));
    return row;
  }
  async resolveAppFeedback(id: number, resolved: boolean): Promise<AppFeedback> {
    const [row] = await db.update(appFeedback).set({ resolved }).where(eq(appFeedback.id, id)).returning();
    return row;
  }
  async deleteAppFeedback(id: number): Promise<void> {
    await db.delete(appFeedback).where(eq(appFeedback.id, id));
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
    // Each query is run independently and protected so that a single
    // missing/renamed column on a particular table cannot zero out the
    // entire dashboard. Failures are logged with the section name so
    // they're easy to fix.
    const safe = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err: any) {
        console.error(`[stats] ${name} failed:`, err?.message || err);
        return fallback;
      }
    };
    const safeCount = (name: string, fn: () => Promise<{ value: number }[]>): Promise<number> =>
      safe(name, async () => (await fn())[0]?.value ?? 0, 0);

    const [
      totalUsers,
      totalProjects,
      totalPublishedApps,
      totalConversations,
      totalMessages,
      suspendedApps,
      totalDomainOrders,
      totalUssdSubscriptions,
      activeUssdSubscriptions,
      activeUssdSubs,
      totalChatbots,
      activeChatbots,
      totalChatbotConversations,
      totalMarketplaceListings,
      marketplaceDownloadsValue,
      totalBlogPosts,
      publishedBlogPosts,
      totalEmailSubscribers,
      activeEmailSubscribers,
      totalEmailCampaigns,
      totalUserFiles,
      totalZipExports,
      totalWebhooks,
      activeWebhooks,
      totalForms,
      totalFormSubmissions,
      allUsers,
      recentUsers,
      recentProjects,
      recentPublishedApps,
      recentDomainOrders,
      recentUssdSubs,
      recentChatbots,
    ] = await Promise.all([
      safeCount("users", () => db.select({ value: count() }).from(users)),
      safeCount("projects", () => db.select({ value: count() }).from(projects)),
      safeCount("publishedApps", () => db.select({ value: count() }).from(publishedApps)),
      safeCount("conversations", () => db.select({ value: count() }).from(conversations)),
      safeCount("messages", () => db.select({ value: count() }).from(messages)),
      safeCount("suspendedApps", () => db.select({ value: count() }).from(publishedApps).where(eq(publishedApps.appStatus, "suspended"))),
      safeCount("domainOrders", () => db.select({ value: count() }).from(domainOrders)),
      safeCount("ussdSubsTotal", () => db.select({ value: count() }).from(ussdSubscriptions)),
      safeCount("ussdSubsActive", () => db.select({ value: count() }).from(ussdSubscriptions).where(eq(ussdSubscriptions.status, "active"))),
      safe("ussdPlans", () => db.select({ plan: ussdSubscriptions.plan }).from(ussdSubscriptions).where(eq(ussdSubscriptions.status, "active")), [] as { plan: string | null }[]),
      safeCount("chatbots", () => db.select({ value: count() }).from(chatbotWidgets)),
      safeCount("activeChatbots", () => db.select({ value: count() }).from(chatbotWidgets).where(eq(chatbotWidgets.isActive, true))),
      safeCount("chatbotConvos", () => db.select({ value: count() }).from(widgetConversations)),
      safeCount("marketplace", () => db.select({ value: count() }).from(marketplaceListings)),
      safe("marketplaceDownloads", async () => (await db.select({ value: sql<number>`coalesce(sum(downloads), 0)` }).from(marketplaceListings))[0]?.value ?? 0, 0),
      safeCount("blogTotal", () => db.select({ value: count() }).from(blogPosts)),
      safeCount("blogPublished", () => db.select({ value: count() }).from(blogPosts).where(eq(blogPosts.status, "published"))),
      safeCount("emailSubs", () => db.select({ value: count() }).from(emailSubscribers)),
      safeCount("emailSubsActive", () => db.select({ value: count() }).from(emailSubscribers).where(eq(emailSubscribers.status, "active"))),
      safeCount("emailCampaigns", () => db.select({ value: count() }).from(emailCampaigns)),
      safeCount("userFiles", () => db.select({ value: count() }).from(userFiles)),
      safeCount("zipExports", () => db.select({ value: count() }).from(zipExports)),
      safeCount("webhooks", () => db.select({ value: count() }).from(webhooks)),
      safeCount("activeWebhooks", () => db.select({ value: count() }).from(webhooks).where(eq(webhooks.isActive, true))),
      safeCount("forms", () => db.select({ value: count() }).from(forms)),
      safeCount("formSubmissions", () => db.select({ value: count() }).from(formSubmissions)),
      safe("allUsersForPlans", () => db.select({ plan: users.plan, paygBalance: users.paygBalance, paygSpent: users.paygSpent }).from(users), [] as { plan: string | null; paygBalance: number | null; paygSpent: number | null }[]),
      safe("recentUsers", () => db.select().from(users).orderBy(desc(users.createdAt)).limit(15), [] as any[]),
      safe("recentProjects", () => db.select().from(projects).orderBy(desc(projects.createdAt)).limit(10), [] as any[]),
      safe("recentPublishedApps", () => db.select().from(publishedApps).orderBy(desc(publishedApps.createdAt)).limit(15), [] as any[]),
      safe("recentDomainOrders", () => db.select().from(domainOrders).orderBy(desc(domainOrders.createdAt)).limit(10), [] as any[]),
      safe("recentUssdSubs", () => db.select().from(ussdSubscriptions).orderBy(desc(ussdSubscriptions.createdAt)).limit(10), [] as any[]),
      safe("recentChatbots", () => db.select().from(chatbotWidgets).orderBy(desc(chatbotWidgets.createdAt)).limit(10), [] as any[]),
    ]);

    const ussdPlanBreakdown = { starter: 0, growth: 0, enterprise: 0 };
    for (const s of activeUssdSubs) {
      const p = s.plan?.toLowerCase() || "";
      if (p === "starter") ussdPlanBreakdown.starter++;
      else if (p === "growth") ussdPlanBreakdown.growth++;
      else if (p === "enterprise") ussdPlanBreakdown.enterprise++;
    }

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

    const ussdMRR = ussdPlanBreakdown.starter * 29 + ussdPlanBreakdown.growth * 79 + ussdPlanBreakdown.enterprise * 199;
    const estimatedMRR = (planBreakdown.pro * 1500 + planBreakdown.business * 2990) / 100 + ussdMRR;

    return {
      totalUsers,
      totalProjects,
      totalPublishedApps,
      totalConversations,
      totalMessages,
      suspendedApps,
      totalDomainOrders,
      planBreakdown,
      estimatedMRR,
      totalPaygBalanceCents,
      totalPaygSpentCents,
      // USSD
      totalUssdSubscriptions,
      activeUssdSubscriptions,
      ussdPlanBreakdown,
      // Chatbot API
      totalChatbots,
      activeChatbots,
      totalChatbotConversations,
      // Marketplace
      totalMarketplaceListings,
      totalMarketplaceDownloads: Number(marketplaceDownloadsValue) || 0,
      // Blog
      totalBlogPosts,
      publishedBlogPosts,
      // Email
      totalEmailSubscribers,
      activeEmailSubscribers,
      totalEmailCampaigns,
      // Files
      totalUserFiles,
      totalZipExports,
      // Webhooks
      totalWebhooks,
      activeWebhooks,
      // Forms
      totalForms,
      totalFormSubmissions,
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
    // Read balance before+after to detect threshold crossings (low / depleted)
    const [before] = await db.select({ balance: users.paygBalance, email: users.email }).from(users).where(eq(users.id, userId));
    await db.update(users).set({
      paygBalance: sql`GREATEST(payg_balance - ${cents}, 0)`,
      paygSpent: sql`payg_spent + ${cents}`,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    if (!before?.email) return;
    const beforeCents = before.balance ?? 0;
    const afterCents = Math.max(beforeCents - cents, 0);
    const LOW_THRESHOLD_CENTS = 100; // $1 left

    // Crossed into low-balance band: send "low" once when crossing threshold
    if (beforeCents > LOW_THRESHOLD_CENTS && afterCents <= LOW_THRESHOLD_CENTS && afterCents > 0) {
      const { sendLowBalanceEmail } = await import("./mailer");
      const remainingGen = Math.floor(afterCents / 2);
      sendLowBalanceEmail(before.email, { balanceCents: afterCents, remainingGenerations: remainingGen }).catch(() => {});
    }
    // Crossed to zero: send "depleted"
    if (beforeCents > 0 && afterCents === 0) {
      const { sendDepletedEmail } = await import("./mailer");
      sendDepletedEmail(before.email).catch(() => {});
    }
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

  async deleteFormSubmission(id: number, formId?: number): Promise<boolean> {
    const where = formId
      ? and(eq(formSubmissions.id, id), eq(formSubmissions.formId, formId))
      : eq(formSubmissions.id, id);
    const rows = await db.delete(formSubmissions).where(where).returning({ id: formSubmissions.id });
    return rows.length > 0;
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

    try {
      const { putBlob, isR2Configured } = await import("./r2");
      if (isR2Configured()) {
        const key = `sites/${publishedAppId}/v${nextVersion}.html`;
        await putBlob(key, htmlContent, "text/html; charset=utf-8");
        await db.update(publishedAppVersions).set({ htmlR2Key: key }).where(eq(publishedAppVersions.id, created.id));
        created.htmlR2Key = key;
      }
    } catch (e: any) {
      console.warn(`[createAppVersion] R2 mirror failed for v${nextVersion}:`, e?.message);
    }
    return created;
  }

  async getPublishedAppVersions(publishedAppId: number): Promise<PublishedAppVersion[]> {
    return db.select().from(publishedAppVersions)
      .where(eq(publishedAppVersions.publishedAppId, publishedAppId))
      .orderBy(desc(publishedAppVersions.versionNumber));
  }

  async getPublishedAppVersion(id: number): Promise<PublishedAppVersion | undefined> {
    const [version] = await db.select().from(publishedAppVersions).where(eq(publishedAppVersions.id, id));
    return version;
  }

  async restoreAppVersion(publishedAppId: number, versionId: number): Promise<PublishedApp> {
    const version = await this.getPublishedAppVersion(versionId);
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

    try {
      const { putBlob, isR2Configured } = await import("./r2");
      if (isR2Configured()) {
        const key = updated.htmlR2Key || `sites/${publishedAppId}.html`;
        await putBlob(key, version.htmlContent, "text/html; charset=utf-8");
        if (!updated.htmlR2Key) {
          await db.update(publishedApps).set({ htmlR2Key: key }).where(eq(publishedApps.id, publishedAppId));
          updated.htmlR2Key = key;
        }
      }
    } catch (e: any) {
      console.warn("[restoreAppVersion] R2 mirror failed:", e?.message);
    }
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

  async updateEmailSubscriberStatus(id: number, status: string, userId?: string): Promise<boolean> {
    const where = userId
      ? and(eq(emailSubscribers.id, id), eq(emailSubscribers.userId, userId))
      : eq(emailSubscribers.id, id);
    const rows = await db.update(emailSubscribers).set({ status }).where(where).returning({ id: emailSubscribers.id });
    return rows.length > 0;
  }

  async deleteEmailSubscriber(id: number, userId?: string): Promise<boolean> {
    const where = userId
      ? and(eq(emailSubscribers.id, id), eq(emailSubscribers.userId, userId))
      : eq(emailSubscribers.id, id);
    const rows = await db.delete(emailSubscribers).where(where).returning({ id: emailSubscribers.id });
    return rows.length > 0;
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

  // ============ Chatbot Q&A (Auto-Scan knowledge base) ============
  async getChatbotQasByWidget(widgetId: number, opts: { includedOnly?: boolean } = {}): Promise<ChatbotQa[]> {
    const conds = [eq(chatbotQas.widgetId, widgetId)];
    if (opts.includedOnly) conds.push(eq(chatbotQas.included, true));
    return db.select().from(chatbotQas).where(and(...conds)).orderBy(chatbotQas.topic, desc(chatbotQas.createdAt));
  }
  async getChatbotQaById(id: number): Promise<ChatbotQa | undefined> {
    const [row] = await db.select().from(chatbotQas).where(eq(chatbotQas.id, id));
    return row;
  }
  async bulkInsertChatbotQas(rows: InsertChatbotQa[]): Promise<ChatbotQa[]> {
    if (rows.length === 0) return [];
    return db.insert(chatbotQas).values(rows).returning();
  }
  async updateChatbotQa(id: number, data: Partial<InsertChatbotQa>): Promise<ChatbotQa> {
    const [updated] = await db.update(chatbotQas).set({ ...data, updatedAt: new Date() } as any).where(eq(chatbotQas.id, id)).returning();
    return updated;
  }
  async deleteChatbotQa(id: number): Promise<void> {
    await db.delete(chatbotQas).where(eq(chatbotQas.id, id));
  }
  async bulkUpdateChatbotQas(widgetId: number, filter: { topic?: string; sensitive?: boolean }, data: Partial<InsertChatbotQa>): Promise<number> {
    const conds = [eq(chatbotQas.widgetId, widgetId)];
    if (filter.topic) conds.push(eq(chatbotQas.topic, filter.topic));
    if (typeof filter.sensitive === "boolean") conds.push(eq(chatbotQas.sensitive, filter.sensitive));
    const updated = await db.update(chatbotQas).set({ ...data, updatedAt: new Date() } as any).where(and(...conds)).returning({ id: chatbotQas.id });
    return updated.length;
  }
  async bulkDeleteChatbotQas(widgetId: number, filter: { topic?: string; sensitive?: boolean }): Promise<number> {
    const conds = [eq(chatbotQas.widgetId, widgetId)];
    if (filter.topic) conds.push(eq(chatbotQas.topic, filter.topic));
    if (typeof filter.sensitive === "boolean") conds.push(eq(chatbotQas.sensitive, filter.sensitive));
    const deleted = await db.delete(chatbotQas).where(and(...conds)).returning({ id: chatbotQas.id });
    return deleted.length;
  }
  async getChatbotScannedPages(widgetId: number): Promise<ChatbotScannedPage[]> {
    return db.select().from(chatbotScannedPages).where(eq(chatbotScannedPages.widgetId, widgetId));
  }
  async upsertChatbotScannedPage(widgetId: number, url: string, contentHash: string): Promise<void> {
    // Concurrency-safe upsert. A unique index on (widget_id, url) backs the
    // ON CONFLICT target so a manual scan + scheduler scan racing on the same
    // page can't throw 23505.
    await db
      .insert(chatbotScannedPages)
      .values({ widgetId, url, contentHash })
      .onConflictDoUpdate({
        target: [chatbotScannedPages.widgetId, chatbotScannedPages.url],
        set: { contentHash, scannedAt: new Date() },
      });
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

  async updateAppSecret(id: number, value: string, userId?: string): Promise<AppSecret | undefined> {
    const where = userId
      ? and(eq(appSecrets.id, id), eq(appSecrets.userId, userId))
      : eq(appSecrets.id, id);
    const [secret] = await db.update(appSecrets).set({ value }).where(where).returning();
    return secret;
  }

  async deleteAppSecret(id: number, userId?: string): Promise<boolean> {
    const where = userId
      ? and(eq(appSecrets.id, id), eq(appSecrets.userId, userId))
      : eq(appSecrets.id, id);
    const rows = await db.delete(appSecrets).where(where).returning({ id: appSecrets.id });
    return rows.length > 0;
  }

  async getActivityLogs(userId: string, limit = 100): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  async createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db.insert(activityLogs).values(data).returning();
    return log;
  }

  async deleteActivityLog(id: number, userId: string): Promise<boolean> {
    const rows = await db
      .delete(activityLogs)
      .where(and(eq(activityLogs.id, id), eq(activityLogs.userId, userId)))
      .returning({ id: activityLogs.id });
    return rows.length > 0;
  }

  // ============ TEAM MEMBERS ============
  async listTeamMembers(country?: string): Promise<TeamMember[]> {
    const where = country ? eq(teamMembers.country, country) : undefined;
    if (where) {
      return db.select().from(teamMembers).where(where).orderBy(desc(teamMembers.createdAt));
    }
    return db.select().from(teamMembers).orderBy(desc(teamMembers.createdAt));
  }

  async getTeamMemberById(id: number): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async getTeamMemberByUserId(userId: string): Promise<TeamMember | undefined> {
    // Returns the most recent active team membership for a given user (a user
    // could in theory be on multiple country teams; we return the active one).
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.status, "active")))
      .orderBy(desc(teamMembers.createdAt))
      .limit(1);
    return member;
  }

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [created] = await db.insert(teamMembers).values(data).returning();
    return created;
  }

  async updateTeamMember(id: number, data: Partial<InsertTeamMember>): Promise<TeamMember | undefined> {
    const [updated] = await db
      .update(teamMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return updated;
  }

  async deleteTeamMember(id: number): Promise<boolean> {
    const rows = await db.delete(teamMembers).where(eq(teamMembers.id, id)).returning({ id: teamMembers.id });
    return rows.length > 0;
  }

  // ============ COUNTRY/RESELLER PARTNER PROGRAM ============
  async createPartnerApplication(data: any): Promise<any> {
    const [created] = await db.insert(partnerApplications).values(data).returning();
    return created;
  }
  async getPartnerApplicationByEmail(email: string): Promise<any | undefined> {
    const [app] = await db.select().from(partnerApplications).where(eq(partnerApplications.email, email)).orderBy(desc(partnerApplications.createdAt)).limit(1);
    return app;
  }
  async getAllPartnerApplications(): Promise<any[]> {
    return db.select().from(partnerApplications).orderBy(desc(partnerApplications.createdAt));
  }
  async getPartnerApplication(id: number): Promise<any | undefined> {
    const [app] = await db.select().from(partnerApplications).where(eq(partnerApplications.id, id));
    return app;
  }
  async updatePartnerApplication(id: number, data: any): Promise<any> {
    const [updated] = await db.update(partnerApplications).set(data).where(eq(partnerApplications.id, id)).returning();
    return updated;
  }

  async createPartner(data: any): Promise<any> {
    const [created] = await db.insert(partners).values(data).returning();
    return created;
  }
  async getPartnerById(id: number): Promise<any | undefined> {
    const [p] = await db.select().from(partners).where(eq(partners.id, id));
    return p;
  }
  async getPartnerBySlug(slug: string): Promise<any | undefined> {
    const [p] = await db.select().from(partners).where(eq(partners.slug, slug));
    return p;
  }
  async getPartnerByUserId(userId: string): Promise<any | undefined> {
    const [p] = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
    return p;
  }
  async getPartnerByCountry(country: string): Promise<any | undefined> {
    // Deterministic: prefer exclusive (premier) partner, then earliest approved.
    const [p] = await db.select().from(partners)
      .where(and(eq(partners.country, country), eq(partners.status, "active")))
      .orderBy(desc(partners.exclusiveCountry), partners.approvedAt)
      .limit(1);
    return p;
  }
  async getAllPartners(opts: { onlyPublic?: boolean } = {}): Promise<any[]> {
    if (opts.onlyPublic) {
      return db.select().from(partners).where(and(eq(partners.status, "active"), eq(partners.publicListed, true))).orderBy(desc(partners.approvedAt));
    }
    return db.select().from(partners).orderBy(desc(partners.approvedAt));
  }
  async updatePartner(id: number, data: any): Promise<any> {
    const [updated] = await db.update(partners).set(data).where(eq(partners.id, id)).returning();
    return updated;
  }

  async attributePartnerCustomer(partnerId: number, userId: string): Promise<any> {
    // Idempotent — if user already attributed (even to a different partner), skip
    const existing = await this.getPartnerCustomerByUserId(userId);
    if (existing) return existing;
    const [created] = await db.insert(partnerCustomers).values({ partnerId, userId }).returning();
    // Bump partner stats
    await db.update(partners).set({ totalCustomers: sql`${partners.totalCustomers} + 1` }).where(eq(partners.id, partnerId));
    return created;
  }
  async getPartnerCustomers(partnerId: number): Promise<any[]> {
    return db.select().from(partnerCustomers).where(eq(partnerCustomers.partnerId, partnerId)).orderBy(desc(partnerCustomers.attributedAt));
  }
  async getPartnerCustomerByUserId(userId: string): Promise<any | undefined> {
    const [pc] = await db.select().from(partnerCustomers).where(eq(partnerCustomers.userId, userId)).limit(1);
    return pc;
  }

  async createPartnerCommission(data: any): Promise<any> {
    // Don't touch partner aggregates here — totals are derived from commission status transitions
    // (approved/paid increment totalEarnedCents; paid increments totalPaidCents via payout).
    const [created] = await db.insert(partnerCommissions).values(data).returning();
    if (data.status === "approved" || data.status === "paid") {
      await db.update(partners).set({ totalEarnedCents: sql`${partners.totalEarnedCents} + ${data.amountCents}` }).where(eq(partners.id, data.partnerId));
    }
    return created;
  }
  async getPartnerCommissions(partnerId: number): Promise<any[]> {
    return db.select().from(partnerCommissions).where(eq(partnerCommissions.partnerId, partnerId)).orderBy(desc(partnerCommissions.createdAt));
  }
  async updatePartnerCommissionStatus(id: number, status: string, payoutId?: number): Promise<void> {
    const [current] = await db.select().from(partnerCommissions).where(eq(partnerCommissions.id, id));
    if (!current) return;
    const data: any = { status };
    if (payoutId !== undefined) data.payoutId = payoutId;
    await db.update(partnerCommissions).set(data).where(eq(partnerCommissions.id, id));
    // Reconcile partner.totalEarnedCents on transitions in/out of {approved|paid}
    const wasEarned = current.status === "approved" || current.status === "paid";
    const isEarned = status === "approved" || status === "paid";
    if (!wasEarned && isEarned) {
      await db.update(partners).set({ totalEarnedCents: sql`${partners.totalEarnedCents} + ${current.amountCents}` }).where(eq(partners.id, current.partnerId));
    } else if (wasEarned && !isEarned) {
      await db.update(partners).set({ totalEarnedCents: sql`${partners.totalEarnedCents} - ${current.amountCents}` }).where(eq(partners.id, current.partnerId));
    }
  }

  async createPartnerLead(data: any): Promise<any> {
    const [created] = await db.insert(partnerLeads).values(data).returning();
    return created;
  }
  async getPartnerLeads(partnerId: number): Promise<any[]> {
    return db.select().from(partnerLeads).where(eq(partnerLeads.partnerId, partnerId)).orderBy(desc(partnerLeads.createdAt));
  }
  async updatePartnerLeadStatus(id: number, status: string, notes?: string): Promise<void> {
    const data: any = { status };
    if (notes !== undefined) data.notes = notes;
    await db.update(partnerLeads).set(data).where(eq(partnerLeads.id, id));
  }

  async createPartnerPayout(data: any): Promise<any> {
    const [created] = await db.insert(partnerPayouts).values(data).returning();
    return created;
  }
  async getPartnerPayouts(partnerId: number): Promise<any[]> {
    return db.select().from(partnerPayouts).where(eq(partnerPayouts.partnerId, partnerId)).orderBy(desc(partnerPayouts.createdAt));
  }
  async updatePartnerPayoutStatus(id: number, status: string, reference?: string): Promise<void> {
    const [payout] = await db.select().from(partnerPayouts).where(eq(partnerPayouts.id, id));
    if (!payout) return;
    const data: any = { status };
    if (reference !== undefined) data.reference = reference;
    if (status === "paid" && payout.status !== "paid") {
      data.paidAt = new Date();
      // Roll up partner totals + flip linked commissions to paid atomically (best-effort).
      await db.update(partners).set({ totalPaidCents: sql`${partners.totalPaidCents} + ${payout.amountCents}` }).where(eq(partners.id, payout.partnerId));
      await db.update(partnerCommissions)
        .set({ status: "paid" })
        .where(and(eq(partnerCommissions.payoutId, id), sql`${partnerCommissions.status} <> 'paid'`));
    }
    await db.update(partnerPayouts).set(data).where(eq(partnerPayouts.id, id));
  }

  async getAllPartnerStats(): Promise<any> {
    const allPartners = await db.select().from(partners);
    const allApps = await db.select().from(partnerApplications);
    const allCustomers = await db.select().from(partnerCustomers);
    const allCommissions = await db.select().from(partnerCommissions);
    const allLeads = await db.select().from(partnerLeads);
    const allPayouts = await db.select().from(partnerPayouts);
    const totalEarned = allCommissions.reduce((s, c) => s + (c.amountCents || 0), 0);
    const totalPaid = allPayouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.amountCents || 0), 0);
    const pendingCommissions = allCommissions.filter(c => c.status === "pending" || c.status === "approved").reduce((s, c) => s + (c.amountCents || 0), 0);
    const byCountry: Record<string, number> = {};
    allPartners.forEach(p => { byCountry[p.countryName || p.country] = (byCountry[p.countryName || p.country] || 0) + 1; });
    const byTier = { authorized: 0, premium: 0, premier: 0 };
    allPartners.forEach(p => { (byTier as any)[p.tier] = ((byTier as any)[p.tier] || 0) + 1; });
    return {
      totalPartners: allPartners.length,
      activePartners: allPartners.filter(p => p.status === "active").length,
      pendingApplications: allApps.filter(a => a.status === "pending").length,
      totalApplications: allApps.length,
      totalAttributedCustomers: allCustomers.length,
      totalLeads: allLeads.length,
      newLeadsThisMonth: allLeads.filter(l => {
        const d = new Date(l.createdAt);
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length,
      totalEarnedCents: totalEarned,
      totalPaidCents: totalPaid,
      pendingCommissionCents: pendingCommissions,
      countriesCovered: Object.keys(byCountry).length,
      partnersByCountry: byCountry,
      partnersByTier: byTier,
    };
  }
  async getAllPartnerCommissions(): Promise<any[]> {
    return db.select().from(partnerCommissions).orderBy(desc(partnerCommissions.createdAt));
  }
  async getAllPartnerLeads(): Promise<any[]> {
    return db.select().from(partnerLeads).orderBy(desc(partnerLeads.createdAt));
  }
  async getAllPartnerPayouts(): Promise<any[]> {
    return db.select().from(partnerPayouts).orderBy(desc(partnerPayouts.createdAt));
  }

  async searchUsersForTeam(query: string, limit = 20): Promise<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>> {
    const q = `%${query.toLowerCase()}%`;
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(sql`LOWER(${users.email}) LIKE ${q} OR LOWER(${users.firstName}) LIKE ${q} OR LOWER(${users.lastName}) LIKE ${q}`)
      .limit(limit);
    return rows;
  }

  // ============ Knowledge Base (semantic RAG) ============
  async createKnowledgeDocument(doc: InsertKnowledgeDocument): Promise<KnowledgeDocument> {
    const [row] = await db.insert(knowledgeDocuments).values(doc).returning();
    return row;
  }
  async getKnowledgeDocumentsByUser(userId: string): Promise<KnowledgeDocument[]> {
    return db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.userId, userId)).orderBy(desc(knowledgeDocuments.createdAt));
  }
  async getKnowledgeDocument(id: number): Promise<KnowledgeDocument | undefined> {
    const [row] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    return row;
  }
  async updateKnowledgeDocument(id: number, data: Partial<KnowledgeDocument>): Promise<KnowledgeDocument> {
    const [updated] = await db.update(knowledgeDocuments).set({ ...data, updatedAt: new Date() } as any).where(eq(knowledgeDocuments.id, id)).returning();
    return updated;
  }
  async deleteKnowledgeDocument(id: number): Promise<void> {
    await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  }
  async insertKnowledgeChunks(rows: InsertKnowledgeChunk[]): Promise<void> {
    if (rows.length === 0) return;
    // Insert in batches to avoid hitting parameter limits on large documents.
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(knowledgeChunks).values(rows.slice(i, i + 200));
    }
  }
  async getKnowledgeChunksForUser(userId: string): Promise<KnowledgeChunk[]> {
    return db.select().from(knowledgeChunks).where(eq(knowledgeChunks.userId, userId));
  }
  async deleteKnowledgeChunksByDocument(documentId: number): Promise<void> {
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
  }
  async setChatbotQaEmbedding(id: number, embedding: number[]): Promise<void> {
    await db.update(chatbotQas).set({ embedding } as any).where(eq(chatbotQas.id, id));
  }
}

export const storage = new DatabaseStorage();
