export interface TutorialLink {
  name: string;
  url: string;
}

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
  text_tutorials: TutorialLink[];
  video_tutorials: TutorialLink[];
  agent_links: TutorialLink[];
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
