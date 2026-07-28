ALTER TABLE `segments` ADD `parent_id` text REFERENCES segments(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `segments_parent_idx` ON `segments` (`parent_id`);