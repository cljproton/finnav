#!/usr/bin/env node
/**
 * 将 Django 的 db.sqlite3 数据导入到 Worker 的 D1 (本地) 数据库。
 * 用法: npx tsx scripts/import-sqlite.ts
 * 前置: 已跑完 drizzle 迁移 (npm run db:migrate:local)
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DJANGO_DB = path.resolve(__dirname, "../../backend/db.sqlite3");
const WRANGLER_STATE = path.resolve(__dirname, "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

function connectDjango() {
  if (!require("node:fs").existsSync(DJANGO_DB)) {
    console.error(`Django db 不存在: ${DJANGO_DB}`);
    process.exit(1);
  }
  return new Database(DJANGO_DB, { readonly: true });
}

function connectD1() {
  if (!require("node:fs").existsSync(WRANGLER_STATE)) {
    console.error(`D1 本地库不存在，请先运行: npm run db:migrate:local`);
    process.exit(1);
  }
  return drizzle(new Database(WRANGLER_STATE), { schema });
}

function mapDate(djangoDate: string | null | undefined): number | null {
  if (!djangoDate) return null;
  // Django 存的是 ISO 8601 (UTC) 如 '2026-01-15 10:30:45.123456+00:00' 或 '2026-01-15 10:30:45'
  const dt = new Date(djangoDate.replace(" ", "T"));
  return Math.floor(dt.getTime() / 1000);
}

async function main() {
  const django = connectDjango();
  const d1 = connectD1();

  console.log("开始导入...");

  // 1. categories
  const cats = django.prepare("SELECT * FROM navigation_category").all() as any[];
  if (cats.length) {
    await d1.insert(schema.categories).values(
      cats.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        sortOrder: c.sort_order,
        isActive: c.is_active ? 1 : 0,
        createdAt: mapDate(c.created_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`categories: ${cats.length} 条`);
  }

  // 2. tags
  const tags = django.prepare("SELECT * FROM navigation_tag").all() as any[];
  if (tags.length) {
    await d1.insert(schema.tags).values(
      tags.map((t) => ({
        id: t.id,
        name: t.name,
        sortOrder: t.sort_order,
        createdAt: mapDate(t.created_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`tags: ${tags.length} 条`);
  }

  // 3. sites
  const sites = django.prepare("SELECT * FROM navigation_site").all() as any[];
  if (sites.length) {
    await d1.insert(schema.sites).values(
      sites.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        url: s.url,
        logo: s.logo,
        logoFetchedAt: mapDate(s.logo_fetched_at),
        categoryId: s.category_id,
        appAndroidUrl: s.app_android_url ?? "",
        appIosUrl: s.app_ios_url ?? "",
        appGooglePlayUrl: s.app_google_play_url ?? "",
        appAndroidFile: s.app_android_file,
        appAndroidSize: s.app_android_size,
        appAndroidCachedAt: mapDate(s.app_android_cached_at),
        appAndroidSha256: s.app_android_sha256 ?? "",
        appAndroidVerifiedAt: mapDate(s.app_android_verified_at),
        appAndroidIntegrityOk: s.app_android_integrity_ok === 1 ? 1 : (s.app_android_integrity_ok === 0 ? 0 : null),
        inviteCode: s.invite_code ?? "",
        inviteLink: s.invite_link ?? "",
        sortOrder: s.sort_order,
        isActive: s.is_active ? 1 : 0,
        visitCount: s.visit_count ?? 0,
        downloadCount: s.download_count ?? 0,
        ratingCount: s.rating_count ?? 0,
        ratingAvg: s.rating_avg ?? 0,
        createdAt: mapDate(s.created_at)!,
        updatedAt: mapDate(s.updated_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`sites: ${sites.length} 条`);
  }

  // 4. site_tags (many-to-many)
  const siteTags = django.prepare("SELECT site_id, tag_id FROM navigation_site_tags").all() as any[];
  if (siteTags.length) {
    await d1.insert(schema.siteTags).values(
      siteTags.map((st) => ({ siteId: st.site_id, tagId: st.tag_id }))
    ).onConflictDoNothing();
    console.log(`site_tags: ${siteTags.length} 条`);
  }

  // 5. users (auth_user)
  const users = django.prepare(`
    SELECT id, email, password, is_active, is_staff, is_superuser, date_joined, last_login
    FROM auth_user
  `).all() as any[];
  if (users.length) {
    await d1.insert(schema.users).values(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        passwordHash: u.password,
        isActive: u.is_active ? 1 : 0,
        isStaff: u.is_staff ? 1 : 0,
        isSuperuser: u.is_superuser ? 1 : 0,
        dateJoined: mapDate(u.date_joined)!,
        lastLogin: mapDate(u.last_login),
      }))
    ).onConflictDoNothing();
    console.log(`users: ${users.length} 条`);
  }

  // 6. email_verifications
  const evs = django.prepare("SELECT * FROM navigation_emailverification").all() as any[];
  if (evs.length) {
    await d1.insert(schema.emailVerifications).values(
      evs.map((e) => ({
        id: e.id,
        email: e.email,
        purpose: e.purpose,
        codeHash: e.code_hash,
        attempts: e.attempts ?? 0,
        expiresAt: mapDate(e.expires_at)!,
        referralCode: e.referral_code ?? "",
        createdAt: mapDate(e.created_at)!,
        updatedAt: mapDate(e.updated_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`email_verifications: ${evs.length} 条`);
  }

  // 7. user_profiles
  const profiles = django.prepare("SELECT * FROM navigation_userprofile").all() as any[];
  if (profiles.length) {
    await d1.insert(schema.userProfiles).values(
      profiles.map((p) => ({
        id: p.id,
        userId: p.user_id,
        referralCode: p.referral_code || null,
        createdAt: mapDate(p.created_at)!,
        updatedAt: mapDate(p.updated_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`user_profiles: ${profiles.length} 条`);
  }

  // 8. ratings
  const ratings = django.prepare("SELECT * FROM navigation_rating").all() as any[];
  if (ratings.length) {
    await d1.insert(schema.ratings).values(
      ratings.map((r) => ({
        id: r.id,
        siteId: r.site_id,
        userId: r.user_id,
        score: r.score,
        comment: r.comment ?? "",
        createdAt: mapDate(r.created_at)!,
        updatedAt: mapDate(r.updated_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`ratings: ${ratings.length} 条`);
  }

  // 9. site_visits
  const visits = django.prepare("SELECT * FROM navigation_sitevisit").all() as any[];
  if (visits.length) {
    await d1.insert(schema.siteVisits).values(
      visits.map((v) => ({
        id: v.id,
        siteId: v.site_id,
        visitedAt: mapDate(v.visited_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`site_visits: ${visits.length} 条`);
  }

  // 10. user_favorites
  const favs = django.prepare("SELECT * FROM navigation_userfavorite").all() as any[];
  if (favs.length) {
    await d1.insert(schema.userFavorites).values(
      favs.map((f) => ({
        id: f.id,
        userId: f.user_id,
        siteId: f.site_id,
        createdAt: mapDate(f.created_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`user_favorites: ${favs.length} 条`);
  }

  // 11. user_site_invites
  const invites = django.prepare("SELECT * FROM navigation_usersiteinvite").all() as any[];
  if (invites.length) {
    await d1.insert(schema.userSiteInvites).values(
      invites.map((i) => ({
        id: i.id,
        userId: i.user_id,
        siteId: i.site_id,
        inviteCode: i.invite_code ?? "",
        inviteLink: i.invite_link ?? "",
        createdAt: mapDate(i.created_at)!,
        updatedAt: mapDate(i.updated_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`user_site_invites: ${invites.length} 条`);
  }

  // 12. user_search_history
  const hist = django.prepare("SELECT * FROM navigation_usersearchhistory").all() as any[];
  if (hist.length) {
    await d1.insert(schema.userSearchHistory).values(
      hist.map((h) => ({
        id: h.id,
        userId: h.user_id,
        term: h.term,
        searchedAt: mapDate(h.searched_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`user_search_history: ${hist.length} 条`);
  }

  // 13. app_settings (单例 id=1)
  const settings = django.prepare("SELECT * FROM navigation_appsetting WHERE id = 1").get() as any;
  if (settings) {
    await d1.insert(schema.appSettings).values({
      id: 1,
      siteTitle: settings.site_title,
      siteSubtitle: settings.site_subtitle ?? "",
      logo: settings.logo,
      seoTitle: settings.seo_title,
      seoDescription: settings.seo_description,
      seoKeywords: settings.seo_keywords,
      announcement: settings.announcement ?? "",
      announcementEnabled: settings.announcement_enabled ? 1 : 0,
      twofaEnabled: settings.twofa_enabled ? 1 : 0,
      headScripts: settings.head_scripts ?? "",
      sitesPerPage: settings.sites_per_page ?? 20,
      shareBaseUrl: settings.share_base_url ?? "",
      updatedAt: mapDate(settings.updated_at)!,
    }).onConflictDoUpdate({
      target: schema.appSettings.id,
      set: {
        siteTitle: settings.site_title,
        siteSubtitle: settings.site_subtitle ?? "",
        logo: settings.logo,
        seoTitle: settings.seo_title,
        seoDescription: settings.seo_description,
        seoKeywords: settings.seo_keywords,
        announcement: settings.announcement ?? "",
        announcementEnabled: settings.announcement_enabled ? 1 : 0,
        twofaEnabled: settings.twofa_enabled ? 1 : 0,
        headScripts: settings.head_scripts ?? "",
        sitesPerPage: settings.sites_per_page ?? 20,
        shareBaseUrl: settings.share_base_url ?? "",
        updatedAt: mapDate(settings.updated_at)!,
      },
    });
    console.log(`app_settings: 1 条 (upsert)`);
  }

  // 14. site_submissions
  const subs = django.prepare("SELECT * FROM navigation_sitesubmission").all() as any[];
  if (subs.length) {
    await d1.insert(schema.siteSubmissions).values(
      subs.map((s) => ({
        id: s.id,
        userId: s.user_id,
        name: s.name,
        url: s.url,
        description: s.description ?? "",
        categoryId: s.category_id,
        status: s.status,
        adminNote: s.admin_note ?? "",
        approvedSiteId: s.approved_site_id,
        createdAt: mapDate(s.created_at)!,
        reviewedAt: mapDate(s.reviewed_at),
      }))
    ).onConflictDoNothing();
    console.log(`site_submissions: ${subs.length} 条`);
  }

  // 15. site_submission_tags
  const subTags = django.prepare("SELECT site_submission_id, tag_id FROM navigation_sitesubmission_tags").all() as any[];
  if (subTags.length) {
    await d1.insert(schema.siteSubmissionTags).values(
      subTags.map((st) => ({ siteSubmissionId: st.site_submission_id, tagId: st.tag_id }))
    ).onConflictDoNothing();
    console.log(`site_submission_tags: ${subTags.length} 条`);
  }

  // 16. site_tutorials
  const tuts = django.prepare("SELECT * FROM navigation_sitetutorial").all() as any[];
  if (tuts.length) {
    await d1.insert(schema.siteTutorials).values(
      tuts.map((t) => ({
        id: t.id,
        siteId: t.site_id,
        userId: t.user_id,
        type: t.type,
        url: t.url,
        title: t.title,
        status: t.status,
        viewCount: t.view_count ?? 0,
        deletePending: t.delete_pending ? 1 : 0,
        deleteRequestedAt: mapDate(t.delete_requested_at),
        createdAt: mapDate(t.created_at)!,
        updatedAt: mapDate(t.updated_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`site_tutorials: ${tuts.length} 条`);
  }

  // 17. app_link_submissions
  const appSubs = django.prepare("SELECT * FROM navigation_applinksubmission").all() as any[];
  if (appSubs.length) {
    await d1.insert(schema.appLinkSubmissions).values(
      appSubs.map((a) => ({
        id: a.id,
        userId: a.user_id,
        siteId: a.site_id,
        platform: a.platform,
        url: a.url,
        status: a.status,
        adminNote: a.admin_note ?? "",
        createdAt: mapDate(a.created_at)!,
        reviewedAt: mapDate(a.reviewed_at),
      }))
    ).onConflictDoNothing();
    console.log(`app_link_submissions: ${appSubs.length} 条`);
  }

  // 18. app_downloads
  const dls = django.prepare("SELECT * FROM navigation_appdownload").all() as any[];
  if (dls.length) {
    await d1.insert(schema.appDownloads).values(
      dls.map((d) => ({
        id: d.id,
        siteId: d.site_id,
        platform: d.platform,
        userId: d.user_id,
        downloadedAt: mapDate(d.downloaded_at)!,
      }))
    ).onConflictDoNothing();
    console.log(`app_downloads: ${dls.length} 条`);
  }

  // 19. admin_users: 若 Django 有超级用户，可选择性迁移一个作为初始管理员
  const superusers = django.prepare(`
    SELECT id, username, password, is_active, date_joined, last_login
    FROM auth_user WHERE is_superuser = 1 LIMIT 1
  `).get() as any;
  if (superusers) {
    await d1.insert(schema.adminUsers).values({
      id: superusers.id,
      username: superusers.username,
      passwordHash: superusers.password,
      isActive: superusers.is_active ? 1 : 0,
      createdAt: mapDate(superusers.date_joined)!,
      lastLogin: mapDate(superusers.last_login),
    }).onConflictDoNothing();
    console.log(`admin_users: 1 条 (超级用户迁移)`);
  }

  console.log("导入完成！");
}

main().catch((e) => {
  console.error("导入失败:", e);
  process.exit(1);
});