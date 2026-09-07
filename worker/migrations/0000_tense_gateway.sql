CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);--> statement-breakpoint
CREATE TABLE `app_downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`platform` text NOT NULL,
	`user_id` integer,
	`downloaded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `app_downloads_downloaded_at_idx` ON `app_downloads` (`downloaded_at`);--> statement-breakpoint
CREATE INDEX `app_downloads_site_id_idx` ON `app_downloads` (`site_id`);--> statement-breakpoint
CREATE TABLE `app_link_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	`platform` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_link_submissions_status_idx` ON `app_link_submissions` (`status`);--> statement-breakpoint
CREATE INDEX `app_link_submissions_user_id_idx` ON `app_link_submissions` (`user_id`);--> statement-breakpoint
CREATE INDEX `app_link_submissions_site_id_idx` ON `app_link_submissions` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_pending_app_link_submission` ON `app_link_submissions` (`user_id`,`site_id`,`platform`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`site_title` text DEFAULT 'FinNav' NOT NULL,
	`site_subtitle` text DEFAULT '' NOT NULL,
	`logo` text,
	`seo_title` text DEFAULT 'FinNav' NOT NULL,
	`seo_description` text DEFAULT 'FinNav一个金融导航应用' NOT NULL,
	`seo_keywords` text DEFAULT '金融，银行，券商，web3' NOT NULL,
	`announcement` text DEFAULT '欢迎来到FinNav！请自觉遵守相关法律法规，合法使用。' NOT NULL,
	`announcement_enabled` integer DEFAULT true NOT NULL,
	`footer_copyright` text DEFAULT 'Copyright © 2026 FinNav.' NOT NULL,
	`require_email_verification` integer DEFAULT false NOT NULL,
	`twofa_enabled` integer DEFAULT false NOT NULL,
	`head_scripts` text DEFAULT '' NOT NULL,
	`sites_per_page` integer DEFAULT 20 NOT NULL,
	`share_base_url` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `categories_sort_order_idx` ON `categories` (`sort_order`);--> statement-breakpoint
CREATE TABLE `email_verifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`referral_code` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_verifications_expires_idx` ON `email_verifications` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_verifications_email_purpose_unique` ON `email_verifications` (`email`,`purpose`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`score` real NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ratings_site_id_idx` ON `ratings` (`site_id`);--> statement-breakpoint
CREATE INDEX `ratings_user_id_idx` ON `ratings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ratings_site_user_unique` ON `ratings` (`site_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `site_submission_tags` (
	`site_submission_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`site_submission_id`, `tag_id`),
	FOREIGN KEY (`site_submission_id`) REFERENCES `site_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text DEFAULT '' NOT NULL,
	`approved_site_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `site_submissions_status_idx` ON `site_submissions` (`status`);--> statement-breakpoint
CREATE INDEX `site_submissions_user_id_idx` ON `site_submissions` (`user_id`);--> statement-breakpoint
CREATE INDEX `site_submissions_created_at_idx` ON `site_submissions` (`created_at`);--> statement-breakpoint
CREATE TABLE `site_tags` (
	`site_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`site_id`, `tag_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_tags_site_id_idx` ON `site_tags` (`site_id`);--> statement-breakpoint
CREATE INDEX `site_tags_tag_id_idx` ON `site_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `site_tutorials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`delete_pending` integer DEFAULT false NOT NULL,
	`delete_requested_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_tutorials_view_count_idx` ON `site_tutorials` (`site_id`,`type`,`view_count`);--> statement-breakpoint
CREATE INDEX `site_tutorials_delete_pending_idx` ON `site_tutorials` (`site_id`,`type`,`delete_pending`);--> statement-breakpoint
CREATE INDEX `site_tutorials_status_idx` ON `site_tutorials` (`site_id`,`status`,`view_count`);--> statement-breakpoint
CREATE INDEX `site_tutorials_user_id_idx` ON `site_tutorials` (`user_id`);--> statement-breakpoint
CREATE TABLE `site_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`visited_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_visits_visited_at_idx` ON `site_visits` (`visited_at`);--> statement-breakpoint
CREATE INDEX `site_visits_site_visited_idx` ON `site_visits` (`site_id`,`visited_at`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`url` text NOT NULL,
	`logo` text,
	`logo_fetched_at` integer,
	`category_id` integer NOT NULL,
	`app_android_url` text DEFAULT '' NOT NULL,
	`app_ios_url` text DEFAULT '' NOT NULL,
	`app_google_play_url` text DEFAULT '' NOT NULL,
	`app_android_file` text,
	`app_android_size` integer,
	`app_android_cached_at` integer,
	`app_android_sha256` text DEFAULT '' NOT NULL,
	`app_android_verified_at` integer,
	`app_android_integrity_ok` integer,
	`invite_code` text DEFAULT '' NOT NULL,
	`invite_link` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`visit_count` integer DEFAULT 0 NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`rating_avg` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sites_sort_order_idx` ON `sites` (`sort_order`);--> statement-breakpoint
CREATE INDEX `sites_is_active_idx` ON `sites` (`is_active`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_sort_order_idx` ON `tags` (`sort_order`,`name`);--> statement-breakpoint
CREATE TABLE `user_favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_favorites_user_id_idx` ON `user_favorites` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_favorites_site_id_idx` ON `user_favorites` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_favorites_user_site_unique` ON `user_favorites` (`user_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`referral_code` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_user_id_unique` ON `user_profiles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_referral_code_unique` ON `user_profiles` (`referral_code`);--> statement-breakpoint
CREATE TABLE `user_search_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`term` text NOT NULL,
	`searched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_search_history_user_id_idx` ON `user_search_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_search_history_searched_at_idx` ON `user_search_history` (`searched_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_search_history_user_term_unique` ON `user_search_history` (`user_id`,`term`);--> statement-breakpoint
CREATE TABLE `user_site_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	`invite_code` text DEFAULT '' NOT NULL,
	`invite_link` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_site_invites_user_id_idx` ON `user_site_invites` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_site_invites_site_id_idx` ON `user_site_invites` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_site_invites_user_site_unique` ON `user_site_invites` (`user_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_staff` integer DEFAULT false NOT NULL,
	`is_superuser` integer DEFAULT false NOT NULL,
	`date_joined` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);