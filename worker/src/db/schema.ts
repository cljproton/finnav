import {
  sqliteTable,
  integer,
  text,
  real,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ===== 核心分类/标签/站点 =====
export const categories = sqliteTable("categories", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  icon: text("icon"),
  sortOrder: integer("sort_order", { mode: "number" }).default(0).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  sortIdx: index("categories_sort_order_idx").on(t.sortOrder),
}));

export const tags = sqliteTable("tags", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order", { mode: "number" }).default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  sortIdx: index("tags_sort_order_idx").on(t.sortOrder, t.name),
}));

export const sites = sqliteTable("sites", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  url: text("url").notNull(),
  logo: text("logo"),
  logoFetchedAt: integer("logo_fetched_at", { mode: "timestamp" }),
  categoryId: integer("category_id", { mode: "number" }).notNull().references(() => categories.id, { onDelete: "cascade" }),
  appAndroidUrl: text("app_android_url").default("").notNull(),
  appIosUrl: text("app_ios_url").default("").notNull(),
  appGooglePlayUrl: text("app_google_play_url").default("").notNull(),
  appAndroidFile: text("app_android_file"),
  appAndroidSize: integer("app_android_size", { mode: "number" }),
  appAndroidCachedAt: integer("app_android_cached_at", { mode: "timestamp" }),
  appAndroidSha256: text("app_android_sha256").default("").notNull(),
  appAndroidVerifiedAt: integer("app_android_verified_at", { mode: "timestamp" }),
  appAndroidIntegrityOk: integer("app_android_integrity_ok", { mode: "boolean" }),
  inviteCode: text("invite_code").default("").notNull(),
  inviteLink: text("invite_link").default("").notNull(),
  sortOrder: integer("sort_order", { mode: "number" }).default(0).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  visitCount: integer("visit_count", { mode: "number" }).default(0).notNull(),
  downloadCount: integer("download_count", { mode: "number" }).default(0).notNull(),
  ratingCount: integer("rating_count", { mode: "number" }).default(0).notNull(),
  ratingAvg: real("rating_avg").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  sortIdx: index("sites_sort_order_idx").on(t.sortOrder),
  activeIdx: index("sites_is_active_idx").on(t.isActive),
}));

export const siteTags = sqliteTable("site_tags", {
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  tagId: integer("tag_id", { mode: "number" }).notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.siteId, t.tagId] }),
  siteIdx: index("site_tags_site_id_idx").on(t.siteId),
  tagIdx: index("site_tags_tag_id_idx").on(t.tagId),
}));

// ===== 用户/认证 =====
export const users = sqliteTable("users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  isStaff: integer("is_staff", { mode: "boolean" }).default(false).notNull(),
  isSuperuser: integer("is_superuser", { mode: "boolean" }).default(false).notNull(),
  dateJoined: integer("date_joined", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  lastLogin: integer("last_login", { mode: "timestamp" }),
});

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  lastLogin: integer("last_login", { mode: "timestamp" }),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  purpose: text("purpose", { enum: ["register", "reset"] }).notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts", { mode: "number" }).default(0).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  referralCode: text("referral_code").default("").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  uniqueEmailPurpose: unique("email_verifications_email_purpose_unique").on(t.email, t.purpose),
  expiresIdx: index("email_verifications_expires_idx").on(t.expiresAt),
}));

export const userProfiles = sqliteTable("user_profiles", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  userId: integer("user_id", { mode: "number" }).notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  referralCode: text("referral_code").unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ===== 互动: 评分/收藏/邀请/搜索历史 =====
export const ratings = sqliteTable("ratings", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  userId: integer("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  score: real("score").notNull(),
  comment: text("comment").default("").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  uniqueSiteUser: unique("ratings_site_user_unique").on(t.siteId, t.userId),
  siteIdx: index("ratings_site_id_idx").on(t.siteId),
  userIdx: index("ratings_user_id_idx").on(t.userId),
}));

export const siteVisits = sqliteTable("site_visits", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  visitedAt: integer("visited_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  visitedIdx: index("site_visits_visited_at_idx").on(t.visitedAt),
  siteVisitedIdx: index("site_visits_site_visited_idx").on(t.siteId, t.visitedAt),
}));

export const userFavorites = sqliteTable("user_favorites", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  userId: integer("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  uniqueUserSite: unique("user_favorites_user_site_unique").on(t.userId, t.siteId),
  userIdx: index("user_favorites_user_id_idx").on(t.userId),
  siteIdx: index("user_favorites_site_id_idx").on(t.siteId),
}));

export const userSiteInvites = sqliteTable("user_site_invites", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  userId: integer("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  inviteCode: text("invite_code").default("").notNull(),
  inviteLink: text("invite_link").default("").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  uniqueUserSite: unique("user_site_invites_user_site_unique").on(t.userId, t.siteId),
  userIdx: index("user_site_invites_user_id_idx").on(t.userId),
  siteIdx: index("user_site_invites_site_id_idx").on(t.siteId),
}));

export const userSearchHistory = sqliteTable("user_search_history", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  userId: integer("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  term: text("term").notNull(),
  searchedAt: integer("searched_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  uniqueUserTerm: unique("user_search_history_user_term_unique").on(t.userId, t.term),
  userIdx: index("user_search_history_user_id_idx").on(t.userId),
  searchedIdx: index("user_search_history_searched_at_idx").on(t.searchedAt),
}));

// ===== 全局设置 =====
export const appSettings = sqliteTable("app_settings", {
  id: integer("id", { mode: "number" }).primaryKey(), // 固定 1
  siteTitle: text("site_title").default("FinNav").notNull(),
  siteSubtitle: text("site_subtitle").default("").notNull(),
  logo: text("logo"),
  seoTitle: text("seo_title").default("FinNav").notNull(),
  seoDescription: text("seo_description").default("FinNav一个金融导航应用").notNull(),
  seoKeywords: text("seo_keywords").default("金融，银行，券商，web3").notNull(),
  announcement: text("announcement").default("欢迎来到FinNav！请自觉遵守相关法律法规，合法使用。").notNull(),
  announcementEnabled: integer("announcement_enabled", { mode: "boolean" }).default(true).notNull(),
  footerCopyright: text("footer_copyright").default("Copyright © 2026 FinNav.").notNull(),
  requireEmailVerification: integer("require_email_verification", { mode: "boolean" }).default(false).notNull(),
  twofaEnabled: integer("twofa_enabled", { mode: "boolean" }).default(false).notNull(),
  headScripts: text("head_scripts").default("").notNull(),
  sitesPerPage: integer("sites_per_page", { mode: "number" }).default(20).notNull(),
  shareBaseUrl: text("share_base_url").default("").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ===== 投稿/审核/教程 =====
export const siteSubmissions = sqliteTable("site_submissions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  userId: integer("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description").default("").notNull(),
  categoryId: integer("category_id", { mode: "number" }).notNull().references(() => categories.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
  adminNote: text("admin_note").default("").notNull(),
  approvedSiteId: integer("approved_site_id", { mode: "number" }).references(() => sites.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
}, (t) => ({
  statusIdx: index("site_submissions_status_idx").on(t.status),
  userIdx: index("site_submissions_user_id_idx").on(t.userId),
  createdIdx: index("site_submissions_created_at_idx").on(t.createdAt),
}));

export const siteSubmissionTags = sqliteTable("site_submission_tags", {
  siteSubmissionId: integer("site_submission_id", { mode: "number" }).notNull().references(() => siteSubmissions.id, { onDelete: "cascade" }),
  tagId: integer("tag_id", { mode: "number" }).notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.siteSubmissionId, t.tagId] }),
}));

export const siteTutorials = sqliteTable("site_tutorials", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  userId: integer("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["text", "video", "agent"] }).notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
  viewCount: integer("view_count", { mode: "number" }).default(0).notNull(),
  deletePending: integer("delete_pending", { mode: "boolean" }).default(false).notNull(),
  deleteRequestedAt: integer("delete_requested_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  viewIdx: index("site_tutorials_view_count_idx").on(t.siteId, t.type, t.viewCount),
  deleteIdx: index("site_tutorials_delete_pending_idx").on(t.siteId, t.type, t.deletePending),
  statusIdx: index("site_tutorials_status_idx").on(t.siteId, t.status, t.viewCount),
  userIdx: index("site_tutorials_user_id_idx").on(t.userId),
}));

export const appLinkSubmissions = sqliteTable("app_link_submissions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  userId: integer("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["android", "google_play", "ios"] }).notNull(),
  url: text("url").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
  adminNote: text("admin_note").default("").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
}, (t) => ({
  uniquePending: unique("unique_pending_app_link_submission").on(t.userId, t.siteId, t.platform),
  statusIdx: index("app_link_submissions_status_idx").on(t.status),
  userIdx: index("app_link_submissions_user_id_idx").on(t.userId),
  siteIdx: index("app_link_submissions_site_id_idx").on(t.siteId),
}));

// ===== APK 下载记录 =====
export const appDownloads = sqliteTable("app_downloads", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  siteId: integer("site_id", { mode: "number" }).notNull().references(() => sites.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["android_cache", "android_original", "google_play", "ios"] }).notNull(),
  userId: integer("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  downloadedAt: integer("downloaded_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (t) => ({
  downloadedIdx: index("app_downloads_downloaded_at_idx").on(t.downloadedAt),
  siteIdx: index("app_downloads_site_id_idx").on(t.siteId),
}));

// ===== 类型导出 =====
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type User = typeof users.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type SiteVisit = typeof siteVisits.$inferSelect;
export type UserFavorite = typeof userFavorites.$inferSelect;
export type UserSiteInvite = typeof userSiteInvites.$inferSelect;
export type UserSearchHistory = typeof userSearchHistory.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type SiteSubmission = typeof siteSubmissions.$inferSelect;
export type SiteTutorial = typeof siteTutorials.$inferSelect;
export type AppLinkSubmission = typeof appLinkSubmissions.$inferSelect;
export type AppDownload = typeof appDownloads.$inferSelect;