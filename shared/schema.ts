export * from "./models/auth";
export * from "./models/chat";

import { pgTable, serial, text, timestamp, varchar, boolean, integer, numeric, jsonb } from "drizzle-orm/pg-core";
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
  customDomain: varchar("custom_domain").unique(),
  customDomainVerified: boolean("custom_domain_verified").notNull().default(false),
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

export const publishedAppVersions = pgTable("published_app_versions", {
  id: serial("id").primaryKey(),
  publishedAppId: integer("published_app_id").notNull().references(() => publishedApps.id, { onDelete: "cascade" }),
  htmlContent: text("html_content").notNull(),
  title: text("title").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  snapshotReason: varchar("snapshot_reason").notNull().default("publish"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type PublishedAppVersion = typeof publishedAppVersions.$inferSelect;

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

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  plan: varchar("plan").notNull(),
  amount: numeric("amount").notNull(),
  currency: varchar("currency").notNull().default("USD"),
  pesapalTrackingId: varchar("pesapal_tracking_id"),
  merchantReference: varchar("merchant_reference").notNull(),
  paymentMethod: varchar("payment_method"),
  confirmationCode: varchar("confirmation_code"),
  status: varchar("status").notNull().default("pending"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export const forms = pgTable("forms", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull().default([]),
  submitButtonText: text("submit_button_text").notNull().default("Submit"),
  successMessage: text("success_message").notNull().default("Thank you! Your submission has been received."),
  notificationEmail: text("notification_email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFormSchema = createInsertSchema(forms).omit({ id: true, createdAt: true, updatedAt: true });
export type Form = typeof forms.$inferSelect;
export type InsertForm = z.infer<typeof insertFormSchema>;

export const formSubmissions = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => forms.id),
  data: jsonb("data").notNull().default({}),
  submitterIp: varchar("submitter_ip"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFormSubmissionSchema = createInsertSchema(formSubmissions).omit({ id: true, createdAt: true });
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;

export const usageLogs = pgTable("usage_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  conversationId: integer("conversation_id"),
  model: varchar("model").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUsageLogSchema = createInsertSchema(usageLogs).omit({
  id: true,
  createdAt: true,
});

export type UsageLog = typeof usageLogs.$inferSelect;
export type InsertUsageLog = z.infer<typeof insertUsageLogSchema>;

// ============ BLOG / CMS ============
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  slug: varchar("slug").notNull(),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt"),
  coverImage: text("cover_image"),
  status: varchar("status").notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true });
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;

// ============ EMAIL MARKETING ============
export const emailSubscribers = pgTable("email_subscribers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  email: varchar("email").notNull(),
  name: text("name"),
  status: varchar("status").notNull().default("active"),
  tags: text("tags").array(),
  subscribedAt: timestamp("subscribed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEmailSubscriberSchema = createInsertSchema(emailSubscribers).omit({ id: true, subscribedAt: true });
export type EmailSubscriber = typeof emailSubscribers.$inferSelect;
export type InsertEmailSubscriber = z.infer<typeof insertEmailSubscriberSchema>;

export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull().default(""),
  status: varchar("status").notNull().default("draft"),
  recipientCount: integer("recipient_count").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  sentAt: timestamp("sent_at"),
});

export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({ id: true, createdAt: true });
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;

// ============ ANALYTICS ============
export const appViews = pgTable("app_views", {
  id: serial("id").primaryKey(),
  publishedAppId: integer("published_app_id").notNull().references(() => publishedApps.id, { onDelete: "cascade" }),
  viewDate: text("view_date").notNull(),
  views: integer("views").notNull().default(1),
});
export type AppView = typeof appViews.$inferSelect;

// ============ MARKETPLACE ============
export const marketplaceListings = pgTable("marketplace_listings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  category: varchar("category").notNull().default("website"),
  htmlContent: text("html_content").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  tags: text("tags").array(),
  price: integer("price").notNull().default(0),
  downloads: integer("downloads").notNull().default(0),
  status: varchar("status").notNull().default("active"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings).omit({ id: true, createdAt: true });
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type InsertMarketplaceListing = z.infer<typeof insertMarketplaceListingSchema>;

// ============ COLLABORATION ============
export const projectCollaborators = pgTable("project_collaborators", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  inviteEmail: varchar("invite_email").notNull(),
  userId: varchar("user_id").references(() => users.id),
  role: varchar("role").notNull().default("viewer"),
  status: varchar("status").notNull().default("pending"),
  invitedAt: timestamp("invited_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertProjectCollaboratorSchema = createInsertSchema(projectCollaborators).omit({ id: true, invitedAt: true });
export type ProjectCollaborator = typeof projectCollaborators.$inferSelect;
export type InsertProjectCollaborator = z.infer<typeof insertProjectCollaboratorSchema>;

// ============ DOMAIN ORDERS ============
export const domainOrders = pgTable("domain_orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  domainName: text("domain_name").notNull(),
  status: varchar("status").notNull().default("pending_payment"), // pending_payment, active, expired, failed
  pricePaid: integer("price_paid_cents").notNull().default(0),
  costPrice: integer("cost_price_cents").notNull().default(0),
  years: integer("years").notNull().default(1),
  expiryDate: text("expiry_date"),
  nameservers: text("nameservers").array(),
  contactFirstName: text("contact_first_name"),
  contactLastName: text("contact_last_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactAddress: text("contact_address"),
  contactCity: text("contact_city"),
  contactState: text("contact_state"),
  contactZip: text("contact_zip"),
  contactCountry: text("contact_country").default("UG"),
  namecomOrderId: text("namecom_order_id"),
  pesapalOrderId: text("pesapal_order_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDomainOrderSchema = createInsertSchema(domainOrders).omit({ id: true, createdAt: true });
export type DomainOrder = typeof domainOrders.$inferSelect;
export type InsertDomainOrder = z.infer<typeof insertDomainOrderSchema>;

export const affiliateApplications = pgTable("affiliate_applications", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: varchar("email").notNull().unique(),
  phone: varchar("phone"),
  country: varchar("country"),
  promotionMethod: text("promotion_method"),
  socialMedia: text("social_media"),
  referralCode: varchar("referral_code").notNull().unique(),
  status: varchar("status").notNull().default("pending"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAffiliateApplicationSchema = createInsertSchema(affiliateApplications).omit({ id: true, createdAt: true });
export type AffiliateApplication = typeof affiliateApplications.$inferSelect;
export type InsertAffiliateApplication = z.infer<typeof insertAffiliateApplicationSchema>;

// ============ API INTEGRATIONS ============
export const apiIntegrations = pgTable("api_integrations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  name: varchar("name").notNull(),
  baseUrl: text("base_url").notNull(),
  method: varchar("method").notNull().default("GET"),
  headers: text("headers"), // JSON string
  authType: varchar("auth_type").notNull().default("none"), // none | apikey | bearer | basic | oauth2 | awssigv4 | digest | hmac | customtoken
  authKey: text("auth_key"),   // header name for api key / HMAC header / OAuth2 scope
  authValue: text("auth_value"), // secret / token / user:pass
  authConfig: text("auth_config"), // JSON for extended auth (OAuth2, AWS, HMAC config)
  description: text("description"),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestStatus: integer("last_test_status"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertApiIntegrationSchema = createInsertSchema(apiIntegrations).omit({ id: true, createdAt: true, lastTestedAt: true, lastTestStatus: true });
export type ApiIntegration = typeof apiIntegrations.$inferSelect;
export type InsertApiIntegration = z.infer<typeof insertApiIntegrationSchema>;

// ============ WEBHOOKS ============
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  publishedAppId: integer("published_app_id").references(() => publishedApps.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  url: text("url").notNull(),
  events: text("events").array().notNull().default(sql`'{}'::text[]`),
  secret: varchar("secret"),
  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  lastStatus: integer("last_status"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertWebhookSchema = createInsertSchema(webhooks).omit({ id: true, createdAt: true, lastTriggeredAt: true, lastStatus: true });
export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;

// ============ APP SEO ============
export const appSeo = pgTable("app_seo", {
  id: serial("id").primaryKey(),
  publishedAppId: integer("published_app_id").notNull().unique().references(() => publishedApps.id, { onDelete: "cascade" }),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  seoKeywords: text("seo_keywords"),
  ogImage: text("og_image"),
  ogTitle: text("og_title"),
  robots: varchar("robots").notNull().default("index, follow"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertAppSeoSchema = createInsertSchema(appSeo).omit({ id: true, updatedAt: true });
export type AppSeo = typeof appSeo.$inferSelect;
export type InsertAppSeo = z.infer<typeof insertAppSeoSchema>;

// ============ CHATBOT WIDGETS ============
export const chatbotWidgets = pgTable("chatbot_widgets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  apiKey: varchar("api_key", { length: 64 }).notNull().unique(),
  knowledgeBase: text("knowledge_base"),
  primaryColor: varchar("primary_color", { length: 20 }).notNull().default("#D4A017"),
  greeting: text("greeting").notNull().default("Hi! How can I help you today?"),
  widgetTitle: text("widget_title").notNull().default("AI Assistant"),
  placeholder: text("placeholder").notNull().default("Type your question..."),
  isActive: boolean("is_active").notNull().default(true),
  showBranding: boolean("show_branding").notNull().default(true),
  whiteLabelName: text("white_label_name"),
  conversationCount: integer("conversation_count").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertChatbotWidgetSchema = createInsertSchema(chatbotWidgets).omit({ id: true, apiKey: true, conversationCount: true, createdAt: true });
export type ChatbotWidget = typeof chatbotWidgets.$inferSelect;
export type InsertChatbotWidget = z.infer<typeof insertChatbotWidgetSchema>;

export const widgetConversations = pgTable("widget_conversations", {
  id: serial("id").primaryKey(),
  widgetId: integer("widget_id").notNull().references(() => chatbotWidgets.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 128 }).notNull(),
  messages: text("messages").notNull().default("[]"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type WidgetConversation = typeof widgetConversations.$inferSelect;

// ============ USER FILES (uploaded images/videos) ============
export const userFiles = pgTable("user_files", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size: integer("size").notNull().default(0),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertUserFileSchema = createInsertSchema(userFiles).omit({ id: true, createdAt: true });
export type UserFile = typeof userFiles.$inferSelect;
export type InsertUserFile = z.infer<typeof insertUserFileSchema>;

// ============ ZIP EXPORTS (download history) ============
export const zipExports = pgTable("zip_exports", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  projectName: text("project_name").notNull(),
  conversationId: integer("conversation_id"),
  fileCount: integer("file_count").notNull().default(1),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertZipExportSchema = createInsertSchema(zipExports).omit({ id: true, createdAt: true });
export type ZipExport = typeof zipExports.$inferSelect;
export type InsertZipExport = z.infer<typeof insertZipExportSchema>;

// ============ USSD SUBSCRIPTIONS ============
export const ussdSubscriptions = pgTable("ussd_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  plan: varchar("plan").notNull(),
  status: varchar("status").notNull().default("active"),
  activatedAt: timestamp("activated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertUssdSubscriptionSchema = createInsertSchema(ussdSubscriptions).omit({ id: true, createdAt: true });
export type UssdSubscription = typeof ussdSubscriptions.$inferSelect;
export type InsertUssdSubscription = z.infer<typeof insertUssdSubscriptionSchema>;

// ============ USSD APPS (actual gateway apps per subscriber) ============
export const ussdApps = pgTable("ussd_apps", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  description: text("description"),
  knowledgeBase: text("knowledge_base"),
  apiKey: varchar("api_key").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  sessionsUsed: integer("sessions_used").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertUssdAppSchema = createInsertSchema(ussdApps).omit({ id: true, createdAt: true, sessionsUsed: true });
export type UssdApp = typeof ussdApps.$inferSelect;
export type InsertUssdApp = z.infer<typeof insertUssdAppSchema>;

// ============ APP SECRETS ============
export const appSecrets = pgTable("app_secrets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  appId: integer("app_id").references(() => publishedApps.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertAppSecretSchema = createInsertSchema(appSecrets).omit({ id: true, createdAt: true });
export type AppSecret = typeof appSecrets.$inferSelect;
export type InsertAppSecret = z.infer<typeof insertAppSecretSchema>;

// ============ ACTIVITY LOGS ============
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventType: varchar("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  appId: integer("app_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// ============ CHATBOT SUBSCRIPTIONS ============
export const chatbotSubscriptions = pgTable("chatbot_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  plan: varchar("plan").notNull(), // starter | business | agency
  status: varchar("status").notNull().default("active"), // active | cancelled
  repliesUsed: integer("replies_used").notNull().default(0),
  repliesLimit: integer("replies_limit").notNull().default(1000),
  botsLimit: integer("bots_limit").notNull().default(1), // -1 = unlimited
  activatedAt: timestamp("activated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertChatbotSubscriptionSchema = createInsertSchema(chatbotSubscriptions).omit({ id: true, createdAt: true });
export type ChatbotSubscription = typeof chatbotSubscriptions.$inferSelect;
export type InsertChatbotSubscription = z.infer<typeof insertChatbotSubscriptionSchema>;

// ===================== AFRO AI EMAIL API =====================

export const emailApiKeys = pgTable("email_api_keys", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull().unique(), // afro_live_...
  secretKeyHash: text("secret_key_hash").notNull(), // bcrypt hash of sk_live_...
  secretKeyPreview: text("secret_key_preview").notNull(), // last 4 chars for display
  plan: varchar("plan").notNull().default("starter"), // starter | pro | enterprise
  emailsSentMonth: integer("emails_sent_month").notNull().default(0),
  monthlyLimit: integer("monthly_limit").notNull().default(3000),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertEmailApiKeySchema = createInsertSchema(emailApiKeys).omit({ id: true, createdAt: true, emailsSentMonth: true, lastUsedAt: true });
export type EmailApiKey = typeof emailApiKeys.$inferSelect;
export type InsertEmailApiKey = z.infer<typeof insertEmailApiKeySchema>;

export const emailApiDomains = pgTable("email_api_domains", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  domain: text("domain").notNull(),
  status: varchar("status").notNull().default("pending"), // pending | verified | failed
  dkimToken: text("dkim_token"),
  spfRecord: text("spf_record"),
  dmarcRecord: text("dmarc_record"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertEmailApiDomainSchema = createInsertSchema(emailApiDomains).omit({ id: true, createdAt: true, verifiedAt: true, dkimToken: true, spfRecord: true, dmarcRecord: true });
export type EmailApiDomain = typeof emailApiDomains.$inferSelect;
export type InsertEmailApiDomain = z.infer<typeof insertEmailApiDomainSchema>;

export const emailApiLogs = pgTable("email_api_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  apiKeyId: integer("api_key_id").references(() => emailApiKeys.id),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  status: varchar("status").notNull().default("sent"), // sent | failed | bounced
  messageId: text("message_id"),
  error: text("error"),
  sentAt: timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertEmailApiLogSchema = createInsertSchema(emailApiLogs).omit({ id: true, sentAt: true });
export type EmailApiLog = typeof emailApiLogs.$inferSelect;
export type InsertEmailApiLog = z.infer<typeof insertEmailApiLogSchema>;
