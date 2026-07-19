CREATE TABLE `component_dependencies` (
	`component_id` text NOT NULL,
	`dep_type` text NOT NULL,
	`dep_path` text,
	`dep_url` text,
	FOREIGN KEY (`component_id`) REFERENCES `library_components`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `component_deps_component_idx` ON `component_dependencies` (`component_id`);--> statement-breakpoint
CREATE TABLE `component_tags` (
	`component_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`component_id`, `tag`),
	FOREIGN KEY (`component_id`) REFERENCES `library_components`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `component_tags_tag_idx` ON `component_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `design_systems` (
	`id` text PRIMARY KEY NOT NULL,
	`source_url` text,
	`source_hash` text NOT NULL,
	`extracted_at` integer NOT NULL,
	`name` text NOT NULL,
	`stack_json` text,
	`status` text NOT NULL,
	`vault_path` text NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_systems_source_hash_uq` ON `design_systems` (`source_hash`);--> statement-breakpoint
CREATE INDEX `design_systems_status_idx` ON `design_systems` (`status`);--> statement-breakpoint
CREATE TABLE `library_components` (
	`id` text PRIMARY KEY NOT NULL,
	`segment_id` text,
	`design_system_id` text,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`bundle_path` text NOT NULL,
	`bundle_hash` text NOT NULL,
	`tokens_json` text,
	`added_at` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`design_system_id`) REFERENCES `design_systems`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `library_components_category_idx` ON `library_components` (`category`);--> statement-breakpoint
CREATE INDEX `library_components_added_at_idx` ON `library_components` (`added_at`);--> statement-breakpoint
CREATE INDEX `library_components_bundle_hash_idx` ON `library_components` (`bundle_hash`);--> statement-breakpoint
CREATE TABLE `llm_cache` (
	`input_hash` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`output_json` text NOT NULL,
	`cost_usd_micros` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_components` (
	`project_id` text NOT NULL,
	`component_id` text NOT NULL,
	`role` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`project_id`, `component_id`, `position`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `library_components`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`content_json` text,
	`branding_json` text,
	`media_manifest_json` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_updated_at_idx` ON `projects` (`updated_at`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`design_system_id` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`html_snippet` text NOT NULL,
	`preview_path` text,
	`position` integer NOT NULL,
	`in_library` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`design_system_id`) REFERENCES `design_systems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `segments_ds_category_idx` ON `segments` (`design_system_id`,`category`);--> statement-breakpoint
CREATE INDEX `segments_in_library_idx` ON `segments` (`in_library`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`input_json` text NOT NULL,
	`output_json` text,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_created_at_idx` ON `tasks` (`created_at`);