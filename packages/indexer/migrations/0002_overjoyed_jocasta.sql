CREATE TABLE `kit_components` (
	`kit_id` text NOT NULL,
	`component_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`kit_id`, `component_id`),
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `library_components`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `kit_components_kit_idx` ON `kit_components` (`kit_id`);--> statement-breakpoint
CREATE INDEX `kit_components_component_idx` ON `kit_components` (`component_id`);--> statement-breakpoint
CREATE TABLE `kits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kits_updated_at_idx` ON `kits` (`updated_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `kit_id` text REFERENCES kits(id);--> statement-breakpoint
CREATE INDEX `projects_kit_idx` ON `projects` (`kit_id`);