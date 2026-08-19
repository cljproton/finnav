export interface Site {
  id: number;
  name: string;
  description: string;
  url: string;
  logo: string | null;
  category: number;
  category_name: string;
  tags: string[];
  sort_order: number;
  app_android_url: string;
  app_android_cache_url: string | null;
  app_android_has_cache: boolean;
  app_android_size: number | null;
  app_android_cached_at: string | null;
  app_android_sha256: string | null;
  app_android_integrity_ok: boolean | null;
  app_ios_url: string;
  app_google_play_url: string;
  invite_code: string;
  invite_link: string;
  visit_count: number;
  rating_count: number;
  rating_avg: number;
}

export interface SiteSettings {
  site_title: string;
  site_subtitle: string;
  logo: string | null;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  announcement: string;
  announcement_enabled: boolean;
  footer_copyright: string;
  require_email_verification: boolean;
  head_scripts: string;
  sites_per_page: number;
  share_base_url: string;
}

export interface UserSiteInvite {
  id: number | null;
  site: number;
  invite_code: string;
  invite_link: string;
  updated_at: string | null;
}

export interface SiteReview {
  id: number;
  score: number;
  comment: string;
  username_masked: string;
  created_at: string;
}

export interface ReviewPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: SiteReview[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string;
  sort_order: number;
}

export interface SitePage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Site[];
}

export interface Tag {
  id: number;
  name: string;
  sort_order: number;
}

export type SiteSubmissionStatus = "pending" | "approved" | "rejected";

export interface SiteSubmission {
  id: number;
  name: string;
  url: string;
  description: string;
  category: number;
  category_name: string;
  tags: string[];
  status: SiteSubmissionStatus;
  admin_note: string;
  created_at: string;
  approved_site: number | null;
}

export type TutorialType = "text" | "video" | "agent";

export type TutorialStatus = "pending" | "approved" | "rejected";

export interface SiteTutorial {
  id: number;
  site: number;
  type: TutorialType;
  url: string;
  title: string;
  status: TutorialStatus;
  view_count: number;
  username_masked: string;
  is_mine: boolean;
  can_delete: boolean;
  delete_pending: boolean;
  created_at: string;
}

export interface SiteTutorialPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: SiteTutorial[];
}

export interface TutorialsTop {
  text: SiteTutorial[];
  video: SiteTutorial[];
  agent: SiteTutorial[];
}

export type AppLinkPlatform = "android" | "google_play" | "ios";

export interface AppLinkSubmission {
  id: number;
  site: number;
  platform: AppLinkPlatform;
  url: string;
  status: SiteSubmissionStatus;
  admin_note: string;
  created_at: string;
}

export interface AppLinkPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: AppLinkSubmission[];
}

export interface PointRule {
  code: string;
  name: string;
  points: number;
  description: string;
}

export interface PointTransaction {
  id: number;
  amount: number;
  balance_after: number;
  rule_code: string | null;
  rule_name: string | null;
  ref_type: string;
  description: string;
  created_at: string;
}

export interface PointTransactionPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: PointTransaction[];
}

export interface MyPoints {
  balance: number;
  lifetime: number;
  referral_code: string;
  referral_share_url: string;
}
