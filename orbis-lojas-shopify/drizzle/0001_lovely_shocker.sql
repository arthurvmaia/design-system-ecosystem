CREATE TABLE `theme_imports` (
	`theme_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_key` text NOT NULL,
	`source_filename` text NOT NULL,
	`source_size` integer NOT NULL,
	`source_fingerprint` text NOT NULL,
	`architecture` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_theme_imports_source_key` ON `theme_imports` (`source_key`);--> statement-breakpoint
CREATE INDEX `idx_theme_imports_user` ON `theme_imports` (`user_id`);